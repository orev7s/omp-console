import { z } from "zod";
import {
  AgentStatusSchema,
  SessionInfoSchema,
  type AgentStatus,
  type SessionInfo,
} from "./common.js";

/**
 * A message translated out of OMP's shape. Nothing above L3 sees OMP field
 * names; this is the one normalized form the control plane and the app use.
 */
export const NormalizedMessageSchema = z.object({
  role: z.string(),
  text: z.string(),
  thinking: z.string(),
  toolCalls: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().optional(),
    }),
  ),
});

export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>;

export const SessionEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("agent.start") }),
  z.object({ kind: z.literal("agent.end"), isTerminal: z.boolean() }),
  z.object({ kind: z.literal("turn.start") }),
  z.object({ kind: z.literal("turn.end") }),
  z.object({
    kind: z.literal("message.start"),
    messageId: z.string(),
    role: z.string(),
  }),
  z.object({
    kind: z.literal("message.delta"),
    messageId: z.string(),
    channel: z.enum(["text", "thinking"]),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("message.end"),
    messageId: z.string(),
    message: NormalizedMessageSchema,
  }),
  z.object({
    kind: z.literal("tool.start"),
    toolName: z.string(),
    toolCallId: z.string().optional(),
  }),
  z.object({
    kind: z.literal("tool.end"),
    toolName: z.string(),
    toolCallId: z.string().optional(),
    isError: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("queue.update"),
    queued: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("prompt.result"),
    status: z.string(),
    agentInvoked: z.boolean(),
    sessionSettled: z.boolean(),
    error: z.unknown().optional(),
  }),
  z.object({ kind: z.literal("session.settled") }),
  z.object({
    kind: z.literal("notice"),
    level: z.string().optional(),
    message: z.string().optional(),
  }),
]);

export type SessionEvent = z.infer<typeof SessionEventSchema>;

export const AgentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent.state"), status: AgentStatusSchema }),
  z.object({ type: z.literal("session.state"), session: SessionInfoSchema }),
  z.object({
    type: z.literal("session.event"),
    sessionId: z.string().min(1),
    event: SessionEventSchema,
  }),
  z.object({
    type: z.literal("server.notice"),
    level: z.string(),
    message: z.string(),
  }),
]);

export type AgentEvent = z.infer<typeof AgentEventSchema>;

export type AgentStateEvent = Extract<AgentEvent, { type: "agent.state" }>;
export type SessionStateEvent = Extract<AgentEvent, { type: "session.state" }>;
export type SessionEventMessage = Extract<
  AgentEvent,
  { type: "session.event" }
>;

export interface AgentEventWithStatus {
  type: "agent.state";
  status: AgentStatus;
}

export interface AgentEventWithSession {
  type: "session.state";
  session: SessionInfo;
}