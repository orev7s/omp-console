import test from "node:test";
import assert from "node:assert/strict";
import { FrameDecoder } from "../src/rpc/decoder.js";
import { RpcProtocolError } from "../src/rpc/errors.js";

const LIMITS = {
  maxFrameBytes: 1_048_576,
  maxReassembledFrameBytes: 67_108_864,
};

/**
 * These tests exercise our decoder math, not OMP. Real-process coverage lives
 * in rpc.real-omp.test.ts, which drives the installed binary.
 */
test("reassembles a two-chunk logical frame", () => {
  const json = JSON.stringify({
    type: "message_end",
    message: { role: "assistant", text: "hello" },
  });
  const bytes = Buffer.from(json, "utf8");
  const cut = Math.ceil(bytes.length / 2);
  const first = bytes.subarray(0, cut);
  const second = bytes.subarray(cut);

  const decoder = new FrameDecoder(LIMITS);
  const a = decoder.decode(
    JSON.stringify({
      type: "rpc_chunk",
      chunkId: "chunk-1",
      index: 0,
      count: 2,
      byteLength: bytes.length,
      data: first.toString("base64"),
    }),
  );
  assert.equal(a, null);

  const b = decoder.decode(
    JSON.stringify({
      type: "rpc_chunk",
      chunkId: "chunk-1",
      index: 1,
      count: 2,
      byteLength: bytes.length,
      data: second.toString("base64"),
    }),
  );
  assert.equal(b?.type, "message_end");
});

test("rejects an out-of-order chunk", () => {
  const decoder = new FrameDecoder(LIMITS);
  assert.throws(
    () =>
      decoder.decode(
        JSON.stringify({
          type: "rpc_chunk",
          chunkId: "c",
          index: 1,
          count: 2,
          byteLength: 4,
          data: "e30=",
        }),
      ),
    (error: unknown) =>
      error instanceof RpcProtocolError && error.code === "chunk_out_of_order",
  );
});

test("rejects a physical frame over maxFrameBytes", () => {
  const decoder = new FrameDecoder({ ...LIMITS, maxFrameBytes: 16 });
  assert.throws(
    () => decoder.decode(JSON.stringify({ type: "notice", text: "x".repeat(64) })),
    (error: unknown) =>
      error instanceof RpcProtocolError && error.code === "frame_too_large",
  );
});

test("rejects a non-JSON line", () => {
  const decoder = new FrameDecoder(LIMITS);
  assert.throws(
    () => decoder.decode("not json"),
    (error: unknown) =>
      error instanceof RpcProtocolError && error.code === "invalid_json",
  );
});