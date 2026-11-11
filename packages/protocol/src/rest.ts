import { z } from "zod";
import { AgentStateSchema, ConnectionModeSchema, TimestampSchema } from "./common.js";

/** GET /v1/health (unauthenticated). */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  name: z.string().min(1),
  version: z.string().min(1),
  apiVersion: z.number().int().positive(),
  time: TimestampSchema,
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** GET /v1/meta (authenticated). */
export const MetaResponseSchema = z.object({
  serverId: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  apiVersion: z.number().int().positive(),
  wsProtocolVersion: z.number().int().positive(),
  agentState: AgentStateSchema,
  ompVersion: z.string().nullable(),
  connectionMode: ConnectionModeSchema.optional(),
  capabilities: z.object({
    agentHost: z.boolean(),
    monitoring: z.boolean(),
  }),
  time: TimestampSchema,
});

export type MetaResponse = z.infer<typeof MetaResponseSchema>;

/** POST /v1/pair request. */
export const PairRequestSchema = z.object({
  code: z.string().min(1).max(128),
  deviceName: z.string().min(1).max(64),
  /** Optional client-generated opaque secret, stored hashed, for future use. */
  deviceSecret: z.string().min(16).max(256).optional(),
});

export type PairRequest = z.infer<typeof PairRequestSchema>;

/** POST /v1/pair response. */
export const PairResponseSchema = z.object({
  deviceId: z.string().min(1),
  deviceToken: z.string().min(1),
  serverId: z.string().min(1),
  serverName: z.string().min(1),
  apiVersion: z.number().int().positive(),
  wsProtocolVersion: z.number().int().positive(),
});

export type PairResponse = z.infer<typeof PairResponseSchema>;
