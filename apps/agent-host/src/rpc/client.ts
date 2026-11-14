import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { Logger } from "../log/index.js";
import { FrameDecoder } from "./decoder.js";
import {
  DEFAULT_MAX_FRAME_BYTES,
  DEFAULT_MAX_REASSEMBLED_FRAME_BYTES,
  ReadyFrameSchema,
  RpcResponseFrameSchema,
  type OmpFrame,
  type ReadyFrame,
  type RpcResponseFrame,
} from "./frames.js";
import {
  RpcClosedError,
  RpcError,
  RpcProtocolError,
  RpcTimeoutError,
} from "./errors.js";

export type FrameHandler = (frame: OmpFrame) => void;

export interface ExitInfo {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export type ExitHandler = (info: ExitInfo) => void;

export interface RpcClientOptions {
  /** Path to the `omp` binary. */
  binPath: string;
  /** Arguments after the binary. The caller supplies `--mode rpc`. */
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  commandTimeoutMs?: number;
  readyTimeoutMs?: number;
  shutdownGraceMs?: number;
  /** Negotiate protocol v2 when the ready frame advertises it. Default true. */
  negotiateV2?: boolean;
  /** Put the child in its own process group so its tree can be killed. */
  detached?: boolean;
  logger?: Logger;
}

export interface SendOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface Pending {
  resolve: (frame: RpcResponseFrame) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  cleanup: () => void;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A timer that never keeps the process alive on its own. */
function timeoutAfter(ms: number): Promise<null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    timer.unref();
  });
}

const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_READY_TIMEOUT_MS = 30_000;
const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;
const STDERR_TAIL_LIMIT = 8 * 1024;

/**
 * Owns one `omp --mode rpc` child.
 *
 * Responsibilities: spawn, wait for `ready`, optionally negotiate v2, write
 * commands, correlate responses by `id`, surface events to one listener set,
 * enforce per-command timeouts, and keep reading stdout after stdin closes so
 * shutdown never hangs. It never interprets event content.
 */
export class RpcClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private decoder: FrameDecoder | null = null;
  private readyDeferred: Deferred<ReadyFrame> | null = null;
  private readyFrame: ReadyFrame | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly handlers = new Set<FrameHandler>();
  private readonly exitHandlers = new Set<ExitHandler>();
  private readonly commandTimeoutMs: number;
  private readonly readyTimeoutMs: number;
  private readonly shutdownGraceMs: number;
  private readonly negotiateV2: boolean;
  private readonly logger: Logger | null;
  private nextId = 1;
  private stderrTail = "";
  private closed = false;
  private exitInfo: ExitInfo | null = null;
  private exitPromise: Promise<ExitInfo> | null = null;

  constructor(private readonly options: RpcClientOptions) {
    this.commandTimeoutMs =
      options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    this.readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    this.shutdownGraceMs =
      options.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS;
    this.negotiateV2 = options.negotiateV2 ?? true;
    this.logger = options.logger ?? null;
  }

  get ready(): ReadyFrame | null {
    return this.readyFrame;
  }

  get stderr(): string {
    return this.stderrTail;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** PID of the child, or null before spawn. */
  get pid(): number | null {
    return this.child?.pid ?? null;
  }

  async start(): Promise<ReadyFrame> {
    if (this.child !== null) {
      throw new RpcError("RPC client already started", "already_started");
    }

    const child = spawn(this.options.binPath, this.options.args ?? [], {
      cwd: this.options.cwd,
      env: { ...process.env, ...(this.options.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
      detached: this.options.detached ?? false,
    });

    this.child = child;
    this.decoder = new FrameDecoder({
      maxFrameBytes: DEFAULT_MAX_FRAME_BYTES,
      maxReassembledFrameBytes: DEFAULT_MAX_REASSEMBLED_FRAME_BYTES,
    });
    this.readyDeferred = deferred<ReadyFrame>();
    this.attach(child);

    const timer = setTimeout(() => {
      this.readyDeferred?.reject(
        new RpcTimeoutError(
          `timed out after ${this.readyTimeoutMs}ms waiting for the ready frame`,
          "ready_timeout",
        ),
      );
    }, this.readyTimeoutMs);

    try {
      const ready = await this.readyDeferred.promise;
      this.readyFrame = ready;
      this.decoder.setLimits(
        ready.maxFrameBytes,
        ready.maxReassembledFrameBytes,
      );
      this.logger?.info("omp ready", {
        protocolVersion: ready.protocolVersion,
        supportedProtocolVersions: ready.supportedProtocolVersions,
      });
      if (
        this.negotiateV2 &&
        ready.supportedProtocolVersions.includes(2)
      ) {
        await this.negotiateProtocol(2);
      }
      return ready;
    } catch (error) {
      await this.close();
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timer);
    }
  }

  onEvent(handler: FrameHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  onExit(handler: ExitHandler): () => void {
    this.exitHandlers.add(handler);
    return () => {
      this.exitHandlers.delete(handler);
    };
  }

  /**
   * Sends one command and resolves with its response. Resolves even when
   * `success` is false; check the field. Rejects only on transport failure,
   * timeout, cancellation, or process exit.
   */
  async sendCommand(
    command: string,
    payload: Record<string, unknown> = {},
    options: SendOptions = {},
  ): Promise<RpcResponseFrame> {
    const child = this.child;
    if (child === null || this.closed || !child.stdin.writable) {
      throw new RpcClosedError();
    }

    const id = `req_${this.nextId}`;
    this.nextId += 1;
    const line = JSON.stringify({ id, type: command, ...payload }) + "\n";
    const limit = this.readyFrame?.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
    if (Buffer.byteLength(line, "utf8") > limit) {
      throw new RpcProtocolError(
        `outbound ${command} frame exceeds maxFrameBytes (${limit})`,
        "outbound_frame_too_large",
      );
    }

    const timeoutMs = options.timeoutMs ?? this.commandTimeoutMs;

    return await new Promise<RpcResponseFrame>((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new RpcClosedError(`the ${command} command was cancelled`));
        return;
      }

      let cleanup = (): void => {};
      const timer = setTimeout(() => {
        this.pending.delete(id);
        cleanup();
        reject(
          new RpcTimeoutError(
            `timed out after ${timeoutMs}ms waiting for the ${command} response`,
          ),
        );
      }, timeoutMs);

      const onAbort = (): void => {
        this.pending.delete(id);
        clearTimeout(timer);
        cleanup();
        reject(new RpcClosedError(`the ${command} command was cancelled`));
      };

      cleanup = () => options.signal?.removeEventListener("abort", onAbort);
      options.signal?.addEventListener("abort", onAbort, { once: true });

      this.pending.set(id, { resolve, reject, timer, cleanup });

      try {
        child.stdin.write(line);
      } catch (error) {
        this.settle(id, { resolve, reject, timer, cleanup });
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  prompt(
    message: string,
    options: SendOptions = {},
  ): Promise<RpcResponseFrame> {
    return this.sendCommand("prompt", { message }, options);
  }

  abort(options: SendOptions = {}): Promise<RpcResponseFrame> {
    return this.sendCommand("abort", {}, options);
  }

  getState(options: SendOptions = {}): Promise<RpcResponseFrame> {
    return this.sendCommand("get_state", {}, options);
  }

  getSessionStats(options: SendOptions = {}): Promise<RpcResponseFrame> {
    return this.sendCommand("get_session_stats", {}, options);
  }

  getAvailableModels(options: SendOptions = {}): Promise<RpcResponseFrame> {
    return this.sendCommand("get_available_models", {}, options);
  }

  getSessionLease(
    sessionIds: string[],
    options: SendOptions = {},
  ): Promise<RpcResponseFrame> {
    return this.sendCommand("get_session_lease", { sessionIds }, options);
  }

  async negotiateProtocol(version: number): Promise<void> {
    const response = await this.sendCommand(
      "negotiate_protocol",
      { protocolVersion: version },
      { timeoutMs: 10_000 },
    );
    if (!response.success) {
      throw new RpcError(
        `protocol negotiation to v${version} failed: ${String(response.error ?? "unknown")}`,
        "negotiate_failed",
      );
    }
    if (this.readyFrame !== null) {
      this.readyFrame = { ...this.readyFrame, protocolVersion: version };
    }
    this.logger?.info("omp protocol negotiated", { protocolVersion: version });
  }

  waitForEvent(
    type: string,
    timeoutMs: number,
    predicate?: (frame: OmpFrame) => boolean,
  ): Promise<OmpFrame> {
    if (this.closed) return Promise.reject(new RpcClosedError());
    return new Promise<OmpFrame>((resolve, reject) => {
      let offEvent = (): void => {};
      let offExit = (): void => {};
      const finish = (settle: () => void): void => {
        clearTimeout(timer);
        offEvent();
        offExit();
        settle();
      };
      const timer = setTimeout(() => {
        finish(() =>
          reject(
            new RpcTimeoutError(
              `timed out after ${timeoutMs}ms waiting for ${type}`,
              "event_timeout",
            ),
          ),
        );
      }, timeoutMs);
      offEvent = this.onEvent((frame) => {
        if (frame.type !== type) return;
        if (predicate !== undefined && !predicate(frame)) return;
        finish(() => resolve(frame));
      });
      const onExit = (): void => {
        finish(() =>
          reject(new RpcClosedError(`omp exited while waiting for ${type}`)),
        );
      };
      this.exitHandlers.add(onExit);
      offExit = () => {
        this.exitHandlers.delete(onExit);
      };
    });
  }

  /**
   * Closes stdin, keeps draining stdout, and waits for exit. Escalates to
   * SIGTERM then SIGKILL only after the grace period. Safe to call repeatedly.
   */
  async close(graceMs: number = this.shutdownGraceMs): Promise<ExitInfo> {
    const child = this.child;
    if (child === null) return { code: null, signal: null };

    if (!child.stdin.destroyed) child.stdin.end();
    const exit =
      this.exitPromise ??
      Promise.resolve<ExitInfo>({
        code: child.exitCode,
        signal: child.signalCode,
      });

    const first = await Promise.race([exit, timeoutAfter(graceMs)]);
    if (
      first === null &&
      child.exitCode === null &&
      child.signalCode === null
    ) {
      child.kill("SIGTERM");
      const second = await Promise.race([exit, timeoutAfter(graceMs)]);
      if (
        second === null &&
        child.exitCode === null &&
        child.signalCode === null
      ) {
        child.kill("SIGKILL");
        await exit;
      }
    }

    this.closed = true;
    this.rejectAll(new RpcClosedError("client closed"));
    return (
      this.exitInfo ?? { code: child.exitCode, signal: child.signalCode }
    );
  }

  private attach(child: ChildProcessWithoutNullStreams): void {
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => {
      if (line.length === 0) return;
      try {
        const frame = this.decoder?.decode(line) ?? null;
        if (frame !== null) this.dispatch(frame);
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });

    child.stderr.on("data", (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-STDERR_TAIL_LIMIT);
      this.logger?.debug("omp stderr", { line: chunk.trimEnd() });
    });

    child.on("error", (error) => {
      this.fail(
        new RpcError(
          `failed to run ${this.options.binPath}: ${error.message}`,
          "spawn_failed",
        ),
      );
    });

    this.exitPromise = new Promise<ExitInfo>((resolve) => {
      child.once("close", (code, signal) => {
        const info: ExitInfo = { code, signal };
        this.exitInfo = info;
        this.closed = true;
        resolve(info);
        this.readyDeferred?.reject(
          new RpcClosedError(
            `omp exited before ready (code ${code}, signal ${signal})`,
          ),
        );
        this.rejectAll(
          new RpcClosedError(`omp exited (code ${code}, signal ${signal})`),
        );
        for (const handler of this.exitHandlers) {
          try {
            handler(info);
          } catch {
            // A listener failure must never prevent the rest of shutdown.
          }
        }
      });
    });
  }

  private dispatch(frame: OmpFrame): void {
    if (frame.type === "ready") {
      const parsed = ReadyFrameSchema.safeParse(frame);
      if (!parsed.success) {
        this.fail(
          new RpcProtocolError("ready frame is malformed", "invalid_ready"),
        );
        return;
      }
      this.readyFrame = parsed.data;
      this.readyDeferred?.resolve(parsed.data);
      return;
    }

    if (frame.type === "response") {
      const parsed = RpcResponseFrameSchema.safeParse(frame);
      if (!parsed.success) {
        this.fail(
          new RpcProtocolError(
            "response frame is malformed",
            "invalid_response",
          ),
        );
        return;
      }
      const response = parsed.data;
      if (response.id !== undefined) {
        const pending = this.pending.get(response.id);
        if (pending !== undefined) {
          this.settle(response.id, pending);
          pending.resolve(response);
          return;
        }
      }
      // A response with no id, or with an id we are not waiting on, is
      // surfaced as an event so the caller can log it without corrupting the
      // correlation table.
    }

    this.emit(frame);
  }

  private emit(frame: OmpFrame): void {
    for (const handler of this.handlers) {
      try {
        handler(frame);
      } catch (error) {
        this.logger?.error("rpc event handler threw", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private settle(id: string, pending: Pending): void {
    this.pending.delete(id);
    clearTimeout(pending.timer);
    pending.cleanup();
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.cleanup();
      pending.reject(error);
    }
  }

  private fail(error: Error): void {
    this.readyDeferred?.reject(error);
    this.rejectAll(error);
    this.closed = true;
    if (this.child !== null && this.child.exitCode === null) {
      this.child.kill("SIGTERM");
    }
  }
}