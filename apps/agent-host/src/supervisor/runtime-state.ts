import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "../log/index.js";
import { isAlive } from "./lock.js";

export interface ChildRecord {
  sessionId: string;
  pid: number;
  pgid: number;
  sessionDir: string;
}

interface StateFile {
  version: 1;
  children: ChildRecord[];
}

/**
 * Records live child pids so the next agent host start can reconcile leftovers.
 * Atomic replace (temp, fsync, rename), mode 0600.
 */
export class RuntimeState {
  /** Serializes writes so concurrent saves cannot race on the temp file. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly path: string) {}

  async load(): Promise<ChildRecord[]> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!isStateFile(parsed)) return [];
      return parsed.children;
    } catch {
      return [];
    }
  }

  async save(children: ChildRecord[]): Promise<void> {
    const run = this.queue.then(() => this.write(children));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async write(children: ChildRecord[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const payload: StateFile = { version: 1, children };
    const temp = `${this.path}.${process.pid}.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2)}.tmp`;
    const handle = await open(temp, "w", 0o600);
    try {
      await handle.writeFile(JSON.stringify(payload, null, 2), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, this.path);
  }

  async clear(): Promise<void> {
    await this.save([]);
  }
}

/**
 * Kills leftover children from a previous run. Children are expected to exit
 * when the agent host's stdin closes, but a crash can leave the process group
 * behind. Runs before any new child is started.
 */
export async function reconcileOrphans(
  records: ChildRecord[],
  logger: Logger,
): Promise<void> {
  for (const record of records) {
    if (!isAlive(record.pid)) continue;
    logger.warn("terminating orphaned omp child", {
      sessionId: record.sessionId,
      pid: record.pid,
    });
    signalGroup(record.pgid, "SIGTERM");
  }
  if (records.some((record) => isAlive(record.pid))) {
    await delay(500);
  }
  for (const record of records) {
    if (!isAlive(record.pid)) continue;
    signalGroup(record.pgid, "SIGKILL");
  }
}

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal);
  } catch {
    try {
      process.kill(pgid, signal);
    } catch {
      // Already gone.
    }
  }
}

function isStateFile(value: unknown): value is StateFile {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record["version"] === 1 && Array.isArray(record["children"]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}