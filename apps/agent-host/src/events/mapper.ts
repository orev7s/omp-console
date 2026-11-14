import type {
  NormalizedMessage,
  SessionEvent,
} from "@omp-console/agent-protocol";
import type { OmpFrame } from "../rpc/frames.js";

/**
 * The single translation point from OMP RPC frames to our L2 event model.
 * Nothing above this function may see an OMP frame name. Unknown frames are
 * ignored (return null) and never fatal.
 */
export function mapOmpFrame(frame: OmpFrame): SessionEvent | null {
  switch (frame.type) {
    case "agent_start":
      return { kind: "agent.start" };
    case "agent_end":
      return { kind: "agent.end", isTerminal: frame["isTerminal"] !== false };
    case "turn_start":
      return { kind: "turn.start" };
    case "turn_end":
      return { kind: "turn.end" };
    case "message_start":
      return {
        kind: "message.start",
        messageId: stringField(frame, "messageId"),
        role: normalizeMessage(frame["message"]).role,
      };
    case "message_end":
      return {
        kind: "message.end",
        messageId: stringField(frame, "messageId"),
        message: normalizeMessage(frame["message"]),
      };
    case "message_update": {
      const update = asRecord(frame["assistantMessageEvent"]);
      if (update === null) return null;
      const delta = update["delta"];
      if (typeof delta !== "string") return null;
      const updateType = typeof update["type"] === "string" ? update["type"] : "";
      if (updateType === "text_delta") {
        return {
          kind: "message.delta",
          messageId: stringField(frame, "messageId"),
          channel: "text",
          text: delta,
        };
      }
      if (updateType === "thinking_delta") {
        return {
          kind: "message.delta",
          messageId: stringField(frame, "messageId"),
          channel: "thinking",
          text: delta,
        };
      }
      return null;
    }
    case "tool_execution_start":
      return {
        kind: "tool.start",
        toolName: stringField(frame, "toolName", "tool_name", "name"),
        ...optionalId(frame),
      };
    case "tool_execution_end":
      return {
        kind: "tool.end",
        toolName: stringField(frame, "toolName", "tool_name", "name"),
        ...optionalId(frame),
        ...(frame["isError"] === true ? { isError: true } : {}),
      };
    case "prompt_result":
      return {
        kind: "prompt.result",
        status: stringField(frame, "status"),
        agentInvoked: frame["agentInvoked"] === true,
        sessionSettled: frame["sessionSettled"] === true,
        ...(frame["error"] === undefined ? {} : { error: frame["error"] }),
      };
    case "session_settled":
      return { kind: "session.settled" };
    case "queue_update":
      return { kind: "queue.update", queued: queueCount(frame) };
    case "notice":
      return {
        kind: "notice",
        ...(typeof frame["level"] === "string" ? { level: frame["level"] } : {}),
        ...(typeof frame["message"] === "string"
          ? { message: frame["message"] }
          : {}),
      };
    default:
      return null;
  }
}

/** Extracts text, thinking, and tool-call identity from an OMP message. */
export function normalizeMessage(message: unknown): NormalizedMessage {
  const record = asRecord(message);
  const role = typeof record?.["role"] === "string" ? record["role"] : "assistant";
  let text = "";
  let thinking = "";
  const toolCalls: { id?: string; name?: string }[] = [];

  const content = record?.["content"];
  if (Array.isArray(content)) {
    for (const block of content) {
      const entry = asRecord(block);
      if (entry === null) continue;
      const type = entry["type"];
      if (type === "text" && typeof entry["text"] === "string") {
        text += entry["text"];
      } else if (type === "thinking" && typeof entry["thinking"] === "string") {
        thinking += entry["thinking"];
      } else if (type === "toolCall" || type === "tool_call") {
        const id = typeof entry["id"] === "string" ? entry["id"] : undefined;
        const name =
          typeof entry["name"] === "string" ? entry["name"] : undefined;
        toolCalls.push({
          ...(id === undefined ? {} : { id }),
          ...(name === undefined ? {} : { name }),
        });
      }
    }
  }

  return { role, text, thinking, toolCalls };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Count for a `queue_update` frame. omp does not document a single count field
 * on this event, so read whichever numeric alias is present and fall back to 0
 * rather than guessing.
 */
function queueCount(frame: OmpFrame): number {
  // Real omp sends `steering` and `followUp` arrays, so the pending count is
  // their combined length. Numeric aliases are kept for other omp versions.
  const steering = frame["steering"];
  const followUp = frame["followUp"];
  if (Array.isArray(steering) || Array.isArray(followUp)) {
    const pending =
      (Array.isArray(steering) ? steering.length : 0) +
      (Array.isArray(followUp) ? followUp.length : 0);
    return pending;
  }
  for (const name of ["queueLength", "queued", "count", "length"]) {
    const value = frame[name];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
  }
  return 0;
}

function stringField(frame: OmpFrame, ...names: string[]): string {
  for (const name of names) {
    const value = frame[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return names[0] ?? "unknown";
}

function optionalId(frame: OmpFrame): { toolCallId?: string } {
  for (const name of ["toolCallId", "toolCallID", "tool_call_id"]) {
    const value = frame[name];
    if (typeof value === "string" && value.length > 0) return { toolCallId: value };
  }
  return {};
}