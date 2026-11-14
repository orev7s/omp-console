import { RpcProtocolError } from "./errors.js";
import {
  RpcChunkFrameSchema,
  type OmpFrame,
} from "./frames.js";

export interface DecoderLimits {
  maxFrameBytes: number;
  maxReassembledFrameBytes: number;
}

interface ChunkState {
  chunkId: string;
  count: number;
  byteLength: number;
  nextIndex: number;
  bytes: number;
  pieces: Buffer[];
}

/**
 * Turns stdout lines into logical frames. A single line is a frame, except
 * under protocol v2 where a logical object too large for one line arrives as a
 * contiguous `rpc_chunk` sequence that this class reassembles.
 *
 * The decoder is strict on purpose: an interleaved, interrupted, reordered, or
 * oversized sequence is a protocol error, never something to paper over.
 */
export class FrameDecoder {
  private limits: DecoderLimits;
  private chunk: ChunkState | null = null;

  constructor(limits: DecoderLimits) {
    this.limits = limits;
  }

  setLimits(maxFrameBytes: number, maxReassembledFrameBytes: number): void {
    this.limits = { maxFrameBytes, maxReassembledFrameBytes };
  }

  /** Returns a complete frame, or null while a chunk sequence is in progress. */
  decode(line: string): OmpFrame | null {
    if (Buffer.byteLength(line, "utf8") > this.limits.maxFrameBytes) {
      throw new RpcProtocolError(
        `stdout frame exceeds maxFrameBytes (${this.limits.maxFrameBytes})`,
        "frame_too_large",
      );
    }

    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new RpcProtocolError("stdout line is not valid JSON", "invalid_json");
    }

    if (!isFrame(value)) {
      throw new RpcProtocolError(
        "stdout frame is not an object with a string type",
        "invalid_frame",
      );
    }

    if (value.type === "rpc_chunk") return this.acceptChunk(value);

    if (this.chunk !== null) {
      this.chunk = null;
      throw new RpcProtocolError(
        "an rpc_chunk sequence was interrupted by another frame",
        "chunk_interrupted",
      );
    }

    return value;
  }

  private acceptChunk(raw: OmpFrame): OmpFrame | null {
    const parsed = RpcChunkFrameSchema.safeParse(raw);
    if (!parsed.success) {
      this.chunk = null;
      throw new RpcProtocolError("rpc_chunk frame is malformed", "invalid_chunk");
    }
    const frame = parsed.data;

    if (this.chunk === null) {
      if (frame.index !== 0) {
        throw new RpcProtocolError(
          "an rpc_chunk sequence must start at index 0",
          "chunk_out_of_order",
        );
      }
      this.chunk = {
        chunkId: frame.chunkId,
        count: frame.count,
        byteLength: frame.byteLength,
        nextIndex: 0,
        bytes: 0,
        pieces: [],
      };
    } else {
      if (this.chunk.chunkId !== frame.chunkId) {
        this.chunk = null;
        throw new RpcProtocolError(
          "interleaved rpc_chunk sequences are not allowed",
          "chunk_interleaved",
        );
      }
      if (
        this.chunk.count !== frame.count ||
        this.chunk.byteLength !== frame.byteLength
      ) {
        this.chunk = null;
        throw new RpcProtocolError(
          "rpc_chunk metadata changed mid-sequence",
          "chunk_inconsistent",
        );
      }
    }

    if (frame.index !== this.chunk.nextIndex) {
      const expected = this.chunk.nextIndex;
      this.chunk = null;
      throw new RpcProtocolError(
        `expected rpc_chunk index ${expected}, got ${frame.index}`,
        "chunk_out_of_order",
      );
    }

    const piece = decodeBase64(frame.data);
    this.chunk.bytes += piece.length;
    if (this.chunk.bytes > this.limits.maxReassembledFrameBytes) {
      this.chunk = null;
      throw new RpcProtocolError(
        `reassembled frame exceeds maxReassembledFrameBytes (${this.limits.maxReassembledFrameBytes})`,
        "chunk_too_large",
      );
    }

    this.chunk.pieces.push(piece);
    this.chunk.nextIndex += 1;

    if (this.chunk.nextIndex < this.chunk.count) return null;

    const state = this.chunk;
    this.chunk = null;
    const bytes = Buffer.concat(state.pieces, state.bytes);
    if (bytes.length !== state.byteLength) {
      throw new RpcProtocolError(
        `rpc_chunk sequence produced ${bytes.length} bytes, expected ${state.byteLength}`,
        "chunk_length_mismatch",
      );
    }

    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new RpcProtocolError(
        "reassembled frame is not strict UTF-8",
        "chunk_invalid_utf8",
      );
    }

    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new RpcProtocolError(
        "reassembled frame is not valid JSON",
        "chunk_invalid_json",
      );
    }

    if (!isFrame(value)) {
      throw new RpcProtocolError(
        "reassembled frame is not an object with a string type",
        "chunk_invalid_frame",
      );
    }

    return value;
  }
}

function decodeBase64(data: string): Buffer {
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new RpcProtocolError(
      "rpc_chunk data is not valid base64",
      "chunk_invalid_base64",
    );
  }
  return Buffer.from(data, "base64");
}

function isFrame(value: unknown): value is OmpFrame {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)["type"] === "string"
  );
}