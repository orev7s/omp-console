import type { Message, MessageTool } from '@omp-console/protocol';

/** A tool call row rendered inside a live message. */
export interface LiveTool {
  id?: string;
  name: string;
  status: 'running' | 'ok' | 'error';
}

/**
 * One message as rendered in the run view. Mirrors the L1 `Message` but adds
 * `streaming`, which is true while text or thinking is still arriving.
 */
export interface LiveMessage {
  id: string;
  role: string;
  text: string;
  thinking: string;
  tools: LiveTool[];
  streaming: boolean;
}

function toLiveTool(tool: MessageTool): LiveTool {
  return { id: tool.id, name: tool.name, status: tool.status };
}

/** Maps a persisted transcript message to its live form. */
export function toLiveMessage(message: Message): LiveMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    thinking: message.thinking,
    tools: message.tools.map(toLiveTool),
    streaming: false,
  };
}

const ASSISTANT_ROLES = new Set(['assistant', 'agent']);

export function isAssistantRole(role: string): boolean {
  return ASSISTANT_ROLES.has(role);
}
