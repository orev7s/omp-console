import { z } from "zod";
import { AgentStateSchema, ConnectionModeSchema, TimestampSchema } from "./common.js";
import { ApiErrorSchema } from "./errors.js";

/** Well-known topics a client can subscribe to. */
export const TOPICS = {
  serverStatus: "server.status",
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

/** Every frame, both directions, carries the protocol version and a timestamp. */
const frameBase = {
  v: z.number().int().positive(),
  ts: z.number().int().nonnegative(),
};

/** Client to server. */
export const ClientFrameSchema = z.discriminatedUnion("type", [
  z.object({
    ...frameBase,
    type: z.literal("subscribe"),
    id: z.string().min(1).max(64),
    topics: z.array(z.string().min(1).max(128)).min(1).max(32),
  }),
  z.object({
    ...frameBase,
    type: z.literal("unsubscribe"),
    id: z.string().min(1).max(64),
    topics: z.array(z.string().min(1).max(128)).min(1).max(32),
  }),
  z.object({
    ...frameBase,
    type: z.literal("ping"),
    id: z.string().min(1).max(64),
  }),
  z.object({
    ...frameBase,
    type: z.literal("echo"),
    id: z.string().min(1).max(64),
    message: z.string().max(4096),
  }),
]);

export type ClientFrame = z.infer<typeof ClientFrameSchema>;

/** `hello` payload, sent immediately after a successful upgrade. */
export const HelloDataSchema = z.object({
  connectionId: z.string().min(1),
  serverId: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  apiVersion: z.number().int().positive(),
  wsProtocolVersion: z.number().int().positive(),
  agentState: AgentStateSchema,
  connectionMode: ConnectionModeSchema.optional(),
});

export type HelloData = z.infer<typeof HelloDataSchema>;

/** Server to client. */
export const ServerFrameSchema = z.discriminatedUnion("type", [
  z.object({
    ...frameBase,
    type: z.literal("hello"),
    data: HelloDataSchema,
  }),
  z.object({
    ...frameBase,
    type: z.literal("response"),
    id: z.string().min(1).max(64),
    ok: z.boolean(),
    data: z.unknown().optional(),
    error: ApiErrorSchema.optional(),
  }),
  z.object({
    ...frameBase,
    type: z.literal("event"),
    topic: z.string().min(1).max(128),
    seq: z.number().int().nonnegative(),
    data: z.unknown(),
  }),
  z.object({
    ...frameBase,
    type: z.literal("pong"),
    id: z.string().min(1).max(64),
  }),
]);

export type ServerFrame = z.infer<typeof ServerFrameSchema>;

/** Payload of the `server.status` event. */
export const ServerStatusEventSchema = z.object({
  agentState: AgentStateSchema,
  connections: z.number().int().nonnegative(),
  uptimeSeconds: z.number().nonnegative(),
  time: TimestampSchema,
});

export type ServerStatusEvent = z.infer<typeof ServerStatusEventSchema>;

/** Echo response payload. */
export const EchoResponseSchema = z.object({
  message: z.string(),
  connectionId: z.string().min(1),
});

export type EchoResponse = z.infer<typeof EchoResponseSchema>;

/** Subscribe/unsubscribe response payload. */
export const SubscriptionsResponseSchema = z.object({
  topics: z.array(z.string()),
});

export type SubscriptionsResponse = z.infer<typeof SubscriptionsResponseSchema>;
