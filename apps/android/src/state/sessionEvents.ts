import type { LiveMessage, LiveTool } from './sessionTypes';
import { isAssistantRole } from './sessionTypes';
import type { SessionEvent } from '@omp-console/protocol';

export interface SessionEventResult {
  messages: LiveMessage[];
  /** Set when the event changed the session's busy state; absent otherwise. */
  busy?: boolean;
  /** Set when the event reported the pending queue depth; absent otherwise. */
  queued?: number;
}

function emptyMessage(id: string, role: string): LiveMessage {
  return { id, role, text: '', thinking: '', tools: [], streaming: true };
}

/** Index of the assistant message tools attach to, or -1 when there is none. */
function lastAssistantIndex(messages: LiveMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (isAssistantRole(messages[i].role)) return i;
  }
  return -1;
}

function toolIndex(tools: LiveTool[], name: string, id?: string): number {
  if (id) {
    const byId = tools.findIndex(tool => tool.id === id);
    if (byId >= 0) return byId;
  }
  for (let i = tools.length - 1; i >= 0; i -= 1) {
    if (tools[i].name === name && tools[i].status === 'running') return i;
  }
  for (let i = tools.length - 1; i >= 0; i -= 1) {
    if (tools[i].status === 'running') return i;
  }
  return -1;
}

function withTools(messages: LiveMessage[], tools: LiveTool[], id?: string): LiveMessage[] {
  const next = messages.slice();
  const idx = lastAssistantIndex(next);
  if (idx >= 0) {
    next[idx] = { ...next[idx], tools };
  } else {
    next.push({ id: id ?? 'assistant', role: 'assistant', text: '', thinking: '', tools, streaming: true });
  }
  return next;
}

/**
 * The live transcript reducer. Pure so it is testable without a socket. Each
 * event returns a new message list and, for lifecycle events, the busy flag.
 */
export function applySessionEvent(
  messages: LiveMessage[],
  event: SessionEvent,
): SessionEventResult {
  switch (event.kind) {
    case 'agent.start':
      return { messages, busy: true };
    case 'agent.end':
    case 'session.settled':
      return { messages, busy: false };
    case 'message.start': {
      const idx = messages.findIndex(m => m.id === event.messageId);
      if (idx >= 0) {
        const next = messages.slice();
        next[idx] = { ...next[idx], role: event.role, streaming: true };
        return { messages: next };
      }
      return { messages: [...messages, emptyMessage(event.messageId, event.role)] };
    }
    case 'message.delta': {
      const idx = messages.findIndex(m => m.id === event.messageId);
      const base = idx >= 0 ? messages : [...messages, emptyMessage(event.messageId, 'assistant')];
      const at = idx >= 0 ? idx : base.length - 1;
      const target = base[at];
      const next = base.slice();
      next[at] =
        event.channel === 'text'
          ? { ...target, text: target.text + event.text }
          : { ...target, thinking: target.thinking + event.text };
      return { messages: next };
    }
    case 'message.end': {
      const final: LiveMessage = {
        id: event.messageId,
        role: event.role,
        text: event.text,
        thinking: event.thinking,
        tools: event.tools.map(tool => ({ id: tool.id, name: tool.name, status: tool.status })),
        streaming: false,
      };
      const idx = messages.findIndex(m => m.id === event.messageId);
      if (idx < 0) return { messages: [...messages, final] };
      const next = messages.slice();
      next[idx] = final;
      return { messages: next };
    }
    case 'tool.start': {
      const idx = lastAssistantIndex(messages);
      const current = idx >= 0 ? messages[idx].tools : [];
      const tools = current.slice();
      const existing = event.toolCallId
        ? tools.findIndex(tool => tool.id === event.toolCallId)
        : tools.findIndex(tool => tool.name === event.toolName && tool.status === 'running');
      if (existing >= 0) {
        tools[existing] = { ...tools[existing], name: event.toolName, status: 'running' };
      } else {
        tools.push({ id: event.toolCallId, name: event.toolName, status: 'running' });
      }
      return { messages: withTools(messages, tools) };
    }
    case 'tool.end': {
      const idx = lastAssistantIndex(messages);
      if (idx < 0) return { messages };
      const tools = messages[idx].tools.slice();
      const at = toolIndex(tools, event.toolName, event.toolCallId);
      if (at >= 0) {
        tools[at] = { ...tools[at], status: event.isError ? 'error' : 'ok' };
        return { messages: withTools(messages, tools) };
      }
      return { messages };
    }
    case 'queue.update':
      return { messages, queued: event.queued };
    default:
      return { messages };
  }
}
