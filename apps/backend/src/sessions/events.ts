import type {
  AgentStatusEvent,
  Message,
  MessageTool,
  Session,
  SessionEvent,
} from "@omp-console/protocol";
import type {
  AgentStatus as L2AgentStatus,
  NormalizedMessage,
  SessionEvent as L2SessionEvent,
} from "@omp-console/agent-protocol";
import { nowIso } from "../util/time.js";
import { randomId } from "../util/id.js";

/**
 * The one place L2 session events become L1 session events. The two shapes
 * differ only where the runtime carries richer detail than the app needs; an
 * unrecognized kind is dropped rather than forwarded raw.
 */
export function toL1SessionEvent(event: L2SessionEvent): SessionEvent | null {
  switch (event.kind) {
    case "agent.start":
      return { kind: "agent.start" };
    case "agent.end":
      return { kind: "agent.end", isTerminal: event.isTerminal };
    case "turn.start":
      return { kind: "turn.start" };
    case "turn.end":
      return { kind: "turn.end" };
    case "message.start":
      return {
        kind: "message.start",
        messageId: event.messageId,
        role: event.role,
      };
    case "message.delta":
      return {
        kind: "message.delta",
        messageId: event.messageId,
        channel: event.channel,
        text: event.text,
      };
    case "message.end":
      return {
        kind: "message.end",
        messageId: event.messageId,
        role: event.message.role,
        text: event.message.text,
        thinking: event.message.thinking,
        tools: toMessageTools(event.message),
      };
    case "tool.start":
      return {
        kind: "tool.start",
        toolName: event.toolName,
        ...(event.toolCallId !== undefined
          ? { toolCallId: event.toolCallId }
          : {}),
      };
    case "tool.end":
      return {
        kind: "tool.end",
        toolName: event.toolName,
        ...(event.toolCallId !== undefined
          ? { toolCallId: event.toolCallId }
          : {}),
        ...(event.isError === true ? { isError: true } : {}),
      };
    case "queue.update":
      return { kind: "queue.update", queued: event.queued };
    case "prompt.result":
      return {
        kind: "prompt.result",
        status: event.status,
        agentInvoked: event.agentInvoked,
        sessionSettled: event.sessionSettled,
      };
    case "session.settled":
      return { kind: "session.settled" };
    case "notice":
      return {
        kind: "notice",
        ...(event.level !== undefined ? { level: event.level } : {}),
        ...(event.message !== undefined ? { message: event.message } : {}),
      };
    default:
      return null;
  }
}

/** Convert a normalized (L2) message into an L1 transcript message. */
export function toL1Message(message: NormalizedMessage): Message {
  return {
    id: randomId(9),
    role: message.role,
    text: message.text,
    thinking: message.thinking,
    tools: toMessageTools(message),
    createdAt: null,
  };
}

/**
 * Map an L2 agent status and the registry's session list into the L1
 * `agent.status` event payload. The registry is the source of the L1 session
 * shape; the L2 status only carries the agent-level state.
 */
export function toAgentStatusEvent(
  status: L2AgentStatus | null,
  sessions: Session[],
): AgentStatusEvent {
  const state = status?.state ?? "unavailable";
  return {
    agentState: state === "failed" ? "crashed" : state,
    sessions,
    time: nowIso(),
  };
}

function toMessageTools(message: NormalizedMessage): MessageTool[] {
  const tools: MessageTool[] = [];
  for (const call of message.toolCalls) {
    if (call.name === undefined) continue;
    tools.push({
      ...(call.id !== undefined ? { id: call.id } : {}),
      name: call.name,
      status: "ok",
    });
  }
  return tools;
}
