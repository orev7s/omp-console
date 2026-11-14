import { z } from "zod";
import { AGENT_PROTOCOL_VERSION } from "./version.js";
import { L2ErrorSchema } from "./common.js";
import { AgentEventSchema, NormalizedMessageSchema } from "./events.js";

export const L2_REQUEST_TYPES = [
  "agent.status",
  "agent.capabilities",
  "session.create",
  "session.list",
  "session.get",
  "session.prompt",
  "session.abort",
  "session.close",
  "session.messages",
  "session.availableModels",
  "session.setModel",
  "session.setThinking",
  "session.stats",
  "session.steer",
  "session.followUp",
  "session.messagesPage",
  "session.subscribe",
  "session.unsubscribe",
] as const;

export type L2RequestType = (typeof L2_REQUEST_TYPES)[number];

export const AgentRequestSchema = z.object({
  v: z.literal(AGENT_PROTOCOL_VERSION),
  id: z.string().min(1),
  type: z.enum(L2_REQUEST_TYPES),
  payload: z.unknown().optional(),
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;

export const AgentResponseSchema = z.object({
  v: z.literal(AGENT_PROTOCOL_VERSION),
  id: z.string().min(1),
  type: z.literal("response"),
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: L2ErrorSchema.optional(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export const AgentEventMessageSchema = z.object({
  v: z.literal(AGENT_PROTOCOL_VERSION),
  type: z.literal("event"),
  event: AgentEventSchema,
});

export type AgentEventMessage = z.infer<typeof AgentEventMessageSchema>;

export const CreateSessionPayloadSchema = z.object({
  cwd: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  thinkingLevel: z.string().min(1).optional(),
});

export type CreateSessionPayload = z.infer<typeof CreateSessionPayloadSchema>;

export const SessionIdPayloadSchema = z.object({
  sessionId: z.string().min(1),
});

export type SessionIdPayload = z.infer<typeof SessionIdPayloadSchema>;

export const PromptPayloadSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
});

export type PromptPayload = z.infer<typeof PromptPayloadSchema>;

export const SubscribePayloadSchema = z.object({
  sessionIds: z.array(z.string().min(1)),
});

export type SubscribePayload = z.infer<typeof SubscribePayloadSchema>;

export const SetModelPayloadSchema = z.object({
  sessionId: z.string().min(1),
  model: z.string().min(1),
});

export type SetModelPayload = z.infer<typeof SetModelPayloadSchema>;

export const SetThinkingPayloadSchema = z.object({
  sessionId: z.string().min(1),
  thinkingLevel: z.string().min(1),
});

export type SetThinkingPayload = z.infer<typeof SetThinkingPayloadSchema>;

export const SteerPayloadSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
});

export type SteerPayload = z.infer<typeof SteerPayloadSchema>;

export const FollowUpPayloadSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
});

export type FollowUpPayload = z.infer<typeof FollowUpPayloadSchema>;

export const MessagesPagePayloadSchema = z.object({
  sessionId: z.string().min(1),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export type MessagesPagePayload = z.infer<typeof MessagesPagePayloadSchema>;

export const SessionMessagesResponseSchema = z.object({
  messages: z.array(NormalizedMessageSchema),
});

export type SessionMessagesResponse = z.infer<typeof SessionMessagesResponseSchema>;

export const SessionMessagesPageResponseSchema = z.object({
  messages: z.array(NormalizedMessageSchema),
  nextCursor: z.string().nullable(),
});

export type SessionMessagesPageResponse = z.infer<
  typeof SessionMessagesPageResponseSchema
>;

export const ModelInfoSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  provider: z.string().optional(),
});

export type ModelInfo = z.infer<typeof ModelInfoSchema>;

export const SessionModelsResponseSchema = z.object({
  models: z.array(ModelInfoSchema),
});

export type SessionModelsResponse = z.infer<typeof SessionModelsResponseSchema>;

export const SessionStatsResponseSchema = z.object({
  stats: z.record(z.unknown()),
});

export type SessionStatsResponse = z.infer<typeof SessionStatsResponseSchema>;

export type DecodedL2 = AgentRequest | AgentResponse | AgentEventMessage;

export function isResponse(value: unknown): value is AgentResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "response"
  );
}

export function isEventMessage(value: unknown): value is AgentEventMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "event"
  );
}