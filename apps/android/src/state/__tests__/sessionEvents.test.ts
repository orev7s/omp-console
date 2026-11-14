import { applySessionEvent } from '../sessionEvents';
import type { LiveMessage } from '../sessionTypes';
import type { SessionEvent } from '@omp-console/protocol';

function message(partial: Partial<LiveMessage> = {}): LiveMessage {
  return {
    id: 'm1',
    role: 'assistant',
    text: '',
    thinking: '',
    tools: [],
    streaming: true,
    ...partial,
  };
}

describe('applySessionEvent lifecycle flags', () => {
  it('marks the session busy on agent.start', () => {
    const messages = [message()];
    const result = applySessionEvent(messages, { kind: 'agent.start' });

    expect(result.busy).toBe(true);
    expect(result.messages).toBe(messages);
  });

  it('marks the session not busy on agent.end', () => {
    const messages = [message()];
    const result = applySessionEvent(messages, { kind: 'agent.end', isTerminal: false });

    expect(result.busy).toBe(false);
    expect(result.messages).toBe(messages);
  });

  it('marks the session not busy on session.settled', () => {
    const messages = [message()];
    const result = applySessionEvent(messages, { kind: 'session.settled' });

    expect(result.busy).toBe(false);
    expect(result.messages).toBe(messages);
  });

  it('reports no busy or queued flag for message events', () => {
    const result = applySessionEvent([], {
      kind: 'message.delta',
      messageId: 'm1',
      channel: 'text',
      text: 'hi',
    });

    expect(result.busy).toBeUndefined();
    expect(result.queued).toBeUndefined();
  });
});

describe('applySessionEvent message.start', () => {
  it('appends a new streaming message with the event role', () => {
    const result = applySessionEvent([], { kind: 'message.start', messageId: 'm1', role: 'user' });

    expect(result.messages).toEqual([
      { id: 'm1', role: 'user', text: '', thinking: '', tools: [], streaming: true },
    ]);
  });

  it('updates the role and streaming flag of an existing message', () => {
    const existing = message({ id: 'm1', role: 'user', text: 'hello', streaming: false });
    const result = applySessionEvent([existing], {
      kind: 'message.start',
      messageId: 'm1',
      role: 'assistant',
    });

    expect(result.messages).toEqual([
      { id: 'm1', role: 'assistant', text: 'hello', thinking: '', tools: [], streaming: true },
    ]);
  });

  it('does not mutate the input list', () => {
    const existing = message({ id: 'm1', text: 'hello', streaming: false });
    const result = applySessionEvent([existing], {
      kind: 'message.start',
      messageId: 'm1',
      role: 'assistant',
    });

    expect(existing.text).toBe('hello');
    expect(existing.streaming).toBe(false);
    expect(result.messages).not.toBe([existing]);
  });
});

describe('applySessionEvent message.delta', () => {
  it('appends text deltas to the matching message', () => {
    const start = message({ id: 'm1', text: 'foo' });
    const result = applySessionEvent([start], {
      kind: 'message.delta',
      messageId: 'm1',
      channel: 'text',
      text: 'bar',
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].text).toBe('foobar');
    expect(result.messages[0].thinking).toBe('');
  });

  it('appends thinking deltas to the thinking channel', () => {
    const start = message({ id: 'm1', text: 'answer' });
    const result = applySessionEvent([start], {
      kind: 'message.delta',
      messageId: 'm1',
      channel: 'thinking',
      text: 'hmm',
    });

    expect(result.messages[0].thinking).toBe('hmm');
    expect(result.messages[0].text).toBe('answer');
  });

  it('creates an assistant placeholder for an unknown message id', () => {
    const result = applySessionEvent([], {
      kind: 'message.delta',
      messageId: 'new',
      channel: 'text',
      text: 'hi',
    });

    expect(result.messages).toEqual([
      { id: 'new', role: 'assistant', text: 'hi', thinking: '', tools: [], streaming: true },
    ]);
  });

  it('does not mutate the original message', () => {
    const original = message({ id: 'm1', text: 'foo' });
    applySessionEvent([original], {
      kind: 'message.delta',
      messageId: 'm1',
      channel: 'text',
      text: 'bar',
    });

    expect(original.text).toBe('foo');
  });
});

describe('applySessionEvent message.end', () => {
  it('replaces a streaming message with the final content', () => {
    const streaming = message({ id: 'm1', text: 'partial', thinking: 'th' });
    const result = applySessionEvent([streaming], {
      kind: 'message.end',
      messageId: 'm1',
      role: 'assistant',
      text: 'complete',
      thinking: 'thought',
      tools: [{ id: 't1', name: 'read', status: 'ok' }],
    });

    expect(result.messages).toEqual([
      {
        id: 'm1',
        role: 'assistant',
        text: 'complete',
        thinking: 'thought',
        tools: [{ id: 't1', name: 'read', status: 'ok' }],
        streaming: false,
      },
    ]);
  });

  it('appends a final message when the id is unknown', () => {
    const result = applySessionEvent([message({ id: 'other' })], {
      kind: 'message.end',
      messageId: 'm2',
      role: 'user',
      text: 'done',
      thinking: '',
      tools: [],
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]).toEqual({
      id: 'm2',
      role: 'user',
      text: 'done',
      thinking: '',
      tools: [],
      streaming: false,
    });
  });
});

describe('applySessionEvent tool.start', () => {
  it('adds a running tool to the last assistant message', () => {
    const assistant = message({ id: 'm1' });
    const result = applySessionEvent([assistant], {
      kind: 'tool.start',
      toolName: 'read',
      toolCallId: 't1',
    });

    expect(result.messages[0].tools).toEqual([{ id: 't1', name: 'read', status: 'running' }]);
  });

  it('creates an assistant message when none exists', () => {
    const result = applySessionEvent([message({ id: 'u1', role: 'user' })], {
      kind: 'tool.start',
      toolName: 'bash',
      toolCallId: 't2',
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[1].tools).toEqual([{ id: 't2', name: 'bash', status: 'running' }]);
  });

  it('reuses a running tool with the same name when no id is given', () => {
    const assistant = message({
      id: 'm1',
      tools: [{ id: 't1', name: 'read', status: 'running' }],
    });
    const result = applySessionEvent([assistant], { kind: 'tool.start', toolName: 'read' });

    expect(result.messages[0].tools).toHaveLength(1);
    expect(result.messages[0].tools[0]).toEqual({ id: 't1', name: 'read', status: 'running' });
  });

  it('matches an existing tool by toolCallId', () => {
    const assistant = message({
      id: 'm1',
      tools: [{ id: 't1', name: 'read', status: 'ok' }],
    });
    const result = applySessionEvent([assistant], {
      kind: 'tool.start',
      toolName: 'read',
      toolCallId: 't1',
    });

    expect(result.messages[0].tools).toEqual([{ id: 't1', name: 'read', status: 'running' }]);
  });

  it('targets the last assistant message, skipping a trailing user message', () => {
    const assistant = message({ id: 'a1' });
    const user = message({ id: 'u1', role: 'user' });
    const result = applySessionEvent([assistant, user], {
      kind: 'tool.start',
      toolName: 'edit',
      toolCallId: 't3',
    });

    expect(result.messages[0].tools).toHaveLength(1);
    expect(result.messages[1].tools).toHaveLength(0);
  });
});

describe('applySessionEvent tool.end', () => {
  it('marks the running tool ok', () => {
    const assistant = message({
      id: 'm1',
      tools: [{ id: 't1', name: 'read', status: 'running' }],
    });
    const result = applySessionEvent([assistant], {
      kind: 'tool.end',
      toolName: 'read',
      toolCallId: 't1',
    });

    expect(result.messages[0].tools).toEqual([{ id: 't1', name: 'read', status: 'ok' }]);
  });

  it('marks the tool error when isError is true', () => {
    const assistant = message({
      id: 'm1',
      tools: [{ id: 't1', name: 'bash', status: 'running' }],
    });
    const result = applySessionEvent([assistant], {
      kind: 'tool.end',
      toolName: 'bash',
      toolCallId: 't1',
      isError: true,
    });

    expect(result.messages[0].tools[0].status).toBe('error');
  });

  it('finds the running tool by name when no id is given', () => {
    const assistant = message({
      id: 'm1',
      tools: [
        { id: 't1', name: 'read', status: 'ok' },
        { id: 't2', name: 'bash', status: 'running' },
      ],
    });
    const result = applySessionEvent([assistant], { kind: 'tool.end', toolName: 'bash' });

    expect(result.messages[0].tools.map(t => t.status)).toEqual(['ok', 'ok']);
  });

  it('leaves messages unchanged when there is no assistant message', () => {
    const user = message({ id: 'u1', role: 'user' });
    const messages = [user];
    const result = applySessionEvent(messages, { kind: 'tool.end', toolName: 'read' });

    expect(result.messages).toBe(messages);
  });

  it('leaves messages unchanged when no running tool matches', () => {
    const assistant = message({
      id: 'm1',
      tools: [{ id: 't1', name: 'read', status: 'ok' }],
    });
    const result = applySessionEvent([assistant], { kind: 'tool.end', toolName: 'read' });

    expect(result.messages[0].tools).toEqual([{ id: 't1', name: 'read', status: 'ok' }]);
  });
});

describe('applySessionEvent queue.update', () => {
  it('reports the queued count without touching messages', () => {
    const messages = [message()];
    const result = applySessionEvent(messages, { kind: 'queue.update', queued: 3 });

    expect(result.queued).toBe(3);
    expect(result.messages).toBe(messages);
  });
});

describe('applySessionEvent non-mutating events', () => {
  it('leaves messages unchanged for a notice', () => {
    const messages = [message({ text: 'kept' })];
    const result = applySessionEvent(messages, { kind: 'notice', message: 'heads up' });

    expect(result.messages).toBe(messages);
    expect(result.messages[0].text).toBe('kept');
  });

  it('leaves messages unchanged for turn and prompt.result events', () => {
    const messages = [message()];
    const events: SessionEvent[] = [
      { kind: 'turn.start' },
      { kind: 'turn.end' },
      { kind: 'prompt.result', status: 'ok', agentInvoked: true, sessionSettled: false },
    ];

    for (const event of events) {
      const result = applySessionEvent(messages, event);
      expect(result.messages).toBe(messages);
      expect(result.busy).toBeUndefined();
      expect(result.queued).toBeUndefined();
    }
  });
});
