import { isAssistantRole, toLiveMessage } from '../sessionTypes';
import type { Message } from '@omp-console/protocol';

function message(partial: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    role: 'assistant',
    text: '',
    thinking: '',
    tools: [],
    createdAt: null,
    ...partial,
  };
}

describe('toLiveMessage', () => {
  it('maps a persisted message into a non-streaming live message', () => {
    const live = toLiveMessage(
      message({
        id: 'm9',
        role: 'user',
        text: 'run the tests',
        thinking: 'considering',
        tools: [],
      }),
    );

    expect(live).toEqual({
      id: 'm9',
      role: 'user',
      text: 'run the tests',
      thinking: 'considering',
      tools: [],
      streaming: false,
    });
  });

  it('maps tools and keeps their status and optional id', () => {
    const live = toLiveMessage(
      message({
        tools: [
          { id: 't1', name: 'read', status: 'ok' },
          { name: 'bash', status: 'running' },
        ],
      }),
    );

    expect(live.tools).toEqual([
      { id: 't1', name: 'read', status: 'ok' },
      { name: 'bash', status: 'running' },
    ]);
  });

  it('returns a fresh tools array rather than sharing the input', () => {
    const source = message({ tools: [{ id: 't1', name: 'read', status: 'ok' }] });
    const live = toLiveMessage(source);

    expect(live.tools).not.toBe(source.tools);
    expect(live.tools[0]).not.toBe(source.tools[0]);
  });
});

describe('isAssistantRole', () => {
  it('treats assistant and agent as assistant roles', () => {
    expect(isAssistantRole('assistant')).toBe(true);
    expect(isAssistantRole('agent')).toBe(true);
  });

  it('rejects other roles', () => {
    expect(isAssistantRole('user')).toBe(false);
    expect(isAssistantRole('system')).toBe(false);
    expect(isAssistantRole('')).toBe(false);
  });

  it('is case sensitive', () => {
    expect(isAssistantRole('Assistant')).toBe(false);
    expect(isAssistantRole('AGENT')).toBe(false);
  });
});
