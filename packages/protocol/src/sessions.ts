import { z } from "zod";
import { TimestampSchema } from "./common.js";

/**
 * L1 session state, as the app sees it. Mirrors the runtime lifecycle but is
 * defined here so the app never imports the L2 agent protocol.
 */
export const SessionStateSchema = z.enum([
  "starting",
  "ready",
  "busy",
  "stopped",
  "crashed",
  "failed",
]);

export type SessionState = z.infer<typeof SessionStateSchema>;

/**
 * An agent session, app-facing. `title` may be empty early in a session's life;
 * the UI falls back to `folder`. `folder` is the basename of `cwd`, sent so the
 * client does not parse paths.
 */
export const SessionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  cwd: z.string().min(1),
  folder: z.string().min(1),
  state: SessionStateSchema,
  model: z.string().nullable(),
  thinkingLevel: z.string().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  lastError: z.string().nullable(),
});

export type Session = z.infer<typeof SessionSchema>;

/** GET /v1/sessions */
export const SessionListResponseSchema = z.object({
  sessions: z.array(SessionSchema),
});

export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

/** GET /v1/sessions/:id */
export const SessionDetailResponseSchema = z.object({
  session: SessionSchema,
});

export type SessionDetailResponse = z.infer<typeof SessionDetailResponseSchema>;

/** POST /v1/sessions */
export const CreateSessionRequestSchema = z.object({
  /** Absolute path to run the agent in. Defaults to the server workspace. */
  cwd: z.string().min(1).max(4096).optional(),
  /** Preferred over `cwd`: a registered project id. */
  projectId: z.string().min(1).max(128).optional(),
  model: z.string().min(1).max(256).optional(),
  thinkingLevel: z.string().min(1).max(64).optional(),
  /** Optional display name. */
  name: z.string().min(1).max(200).optional(),
});

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const CreateSessionResponseSchema = z.object({
  session: SessionSchema,
});

export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

/** A model the session can switch to. */
export const ModelInfoSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  provider: z.string().optional(),
});

export type ModelInfo = z.infer<typeof ModelInfoSchema>;

/** GET /v1/sessions/:id/models */
export const SessionModelsResponseSchema = z.object({
  models: z.array(ModelInfoSchema),
});

export type SessionModelsResponse = z.infer<typeof SessionModelsResponseSchema>;

/** POST /v1/sessions/:id/model */
export const SetModelRequestSchema = z.object({
  model: z.string().min(1).max(256),
});

export type SetModelRequest = z.infer<typeof SetModelRequestSchema>;

/** POST /v1/sessions/:id/thinking */
export const SetThinkingRequestSchema = z.object({
  thinkingLevel: z.string().min(1).max(64),
});

export type SetThinkingRequest = z.infer<typeof SetThinkingRequestSchema>;

/** GET /v1/sessions/:id/stats */
export const SessionStatsResponseSchema = z.object({
  stats: z.record(z.unknown()),
});

export type SessionStatsResponse = z.infer<typeof SessionStatsResponseSchema>;

/** POST /v1/sessions/:id/steer */
export const SteerRequestSchema = z.object({
  message: z.string().min(1).max(100_000),
});

export type SteerRequest = z.infer<typeof SteerRequestSchema>;

/** POST /v1/sessions/:id/follow-up */
export const FollowUpRequestSchema = z.object({
  message: z.string().min(1).max(100_000),
});

export type FollowUpRequest = z.infer<typeof FollowUpRequestSchema>;

/** Generic accepted response for steer and follow-up. */
export const AcceptedResponseSchema = z.object({
  accepted: z.literal(true),
});

export type AcceptedResponse = z.infer<typeof AcceptedResponseSchema>;

/** POST /v1/sessions/:id/prompt */
export const PromptRequestSchema = z.object({
  message: z.string().min(1).max(100_000),
});

export type PromptRequest = z.infer<typeof PromptRequestSchema>;

export const PromptResponseSchema = z.object({
  accepted: z.literal(true),
});

export type PromptResponse = z.infer<typeof PromptResponseSchema>;

/** POST /v1/sessions/:id/abort */
export const AbortResponseSchema = z.object({
  aborted: z.literal(true),
});

export type AbortResponse = z.infer<typeof AbortResponseSchema>;

/** A tool call rendered inside a message. */
export const MessageToolSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  status: z.enum(["running", "ok", "error"]),
});

export type MessageTool = z.infer<typeof MessageToolSchema>;

/** One message in a session transcript. */
export const MessageSchema = z.object({
  id: z.string().min(1),
  role: z.string(),
  text: z.string(),
  thinking: z.string(),
  tools: z.array(MessageToolSchema),
  createdAt: TimestampSchema.nullable(),
});

export type Message = z.infer<typeof MessageSchema>;

/** GET /v1/sessions/:id/messages */
export const MessagesResponseSchema = z.object({
  messages: z.array(MessageSchema),
  nextCursor: z.string().nullable(),
});

export type MessagesResponse = z.infer<typeof MessagesResponseSchema>;

/** A project root the user has registered. */
export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
});

export type Project = z.infer<typeof ProjectSchema>;

/** GET /v1/projects */
export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectSchema),
});

export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;

/** POST /v1/projects */
export const AddProjectRequestSchema = z.object({
  path: z.string().min(1).max(4096),
  name: z.string().min(1).max(200).optional(),
});

export type AddProjectRequest = z.infer<typeof AddProjectRequestSchema>;

export const AddProjectResponseSchema = z.object({
  project: ProjectSchema,
});

export type AddProjectResponse = z.infer<typeof AddProjectResponseSchema>;

/** DELETE /v1/projects/:id */
export const RemoveProjectResponseSchema = z.object({
  removed: z.literal(true),
});

export type RemoveProjectResponse = z.infer<typeof RemoveProjectResponseSchema>;

/**
 * A normalized session event, streamed over the `session:<id>.events` topic.
 * These kinds are the single normalized vocabulary produced by the agent host;
 * no OMP frame names appear here. The app renders directly from these.
 */
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
    role: z.string(),
    text: z.string(),
    thinking: z.string(),
    tools: z.array(MessageToolSchema),
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
  }),
  z.object({ kind: z.literal("session.settled") }),
  z.object({
    kind: z.literal("notice"),
    level: z.string().optional(),
    message: z.string().optional(),
  }),
]);

export type SessionEvent = z.infer<typeof SessionEventSchema>;

/** Payload of a `session:<id>.events` topic event. */
export const SessionStreamEventSchema = z.object({
  sessionId: z.string().min(1),
  event: SessionEventSchema,
});

export type SessionStreamEvent = z.infer<typeof SessionStreamEventSchema>;

/** Payload of the `agent.status` topic event. */
export const AgentStatusEventSchema = z.object({
  agentState: z.enum([
    "unavailable",
    "stopped",
    "starting",
    "ready",
    "busy",
    "crashed",
  ]),
  sessions: z.array(SessionSchema),
  time: TimestampSchema,
});

export type AgentStatusEvent = z.infer<typeof AgentStatusEventSchema>;
