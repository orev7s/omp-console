import { z } from "zod";

/**
 * Defaults advertised in OMP's `ready` frame. Kept here so the decoder and the
 * client share one source and a missing field cannot silently become unlimited.
 */
export const DEFAULT_MAX_FRAME_BYTES = 1_048_576;
export const DEFAULT_MAX_REASSEMBLED_FRAME_BYTES = 67_108_864;

/** First frame on stdout. Advertises protocol versions and transport limits. */
export const ReadyFrameSchema = z.object({
  type: z.literal("ready"),
  protocolVersion: z.number().int().positive(),
  supportedProtocolVersions: z.array(z.number().int().positive()).min(1),
  maxFrameBytes: z.number().int().positive(),
  maxReassembledFrameBytes: z.number().int().positive(),
  supportsBashExcludeFromContext: z.boolean().optional(),
});

export type ReadyFrame = z.infer<typeof ReadyFrameSchema>;

/** One physical slice of an oversized logical frame under protocol v2. */
export const RpcChunkFrameSchema = z.object({
  type: z.literal("rpc_chunk"),
  chunkId: z.string().min(1),
  index: z.number().int().nonnegative(),
  count: z.number().int().positive(),
  byteLength: z.number().int().nonnegative(),
  data: z.string(),
});

export type RpcChunkFrame = z.infer<typeof RpcChunkFrameSchema>;

/** Command response. `id` echoes the command that produced it. */
export const RpcResponseFrameSchema = z.object({
  type: z.literal("response"),
  id: z.string().min(1).optional(),
  command: z.string().min(1),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.unknown().optional(),
});

export type RpcResponseFrame = z.infer<typeof RpcResponseFrameSchema>;

/**
 * Any other stdout object. Events are intentionally not narrowed here: the
 * event mapper is the one place that may know OMP event names, and nothing
 * above the agent host sees these shapes.
 */
export interface OmpFrame {
  type: string;
  [key: string]: unknown;
}