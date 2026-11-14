import test from "node:test";
import assert from "node:assert/strict";
import { mapOmpFrame, normalizeMessage } from "../src/events/mapper.js";

/** Shapes below are copied from a real omp v18.18.9 capture. */

test("maps message lifecycle frames", () => {
  const start = mapOmpFrame({
    type: "message_start",
    messageId: "msg-1",
    message: {
      role: "user",
      content: [{ type: "text", text: "hello" }],
    },
  });
  assert.deepEqual(start, {
    kind: "message.start",
    messageId: "msg-1",
    role: "user",
  });

  const delta = mapOmpFrame({
    type: "message_update",
    messageId: "msg-2",
    assistantMessageEvent: { type: "text_delta", delta: "hi" },
  });
  assert.deepEqual(delta, {
    kind: "message.delta",
    messageId: "msg-2",
    channel: "text",
    text: "hi",
  });

  const end = mapOmpFrame({
    type: "message_end",
    messageId: "msg-2",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "plan" },
        { type: "text", text: "answer" },
      ],
    },
  });
  assert.equal(end?.kind, "message.end");
  if (end?.kind === "message.end") {
    assert.equal(end.message.text, "answer");
    assert.equal(end.message.thinking, "plan");
  }
});

test("maps lifecycle and prompt frames", () => {
  assert.deepEqual(mapOmpFrame({ type: "agent_start" }), {
    kind: "agent.start",
  });
  assert.deepEqual(mapOmpFrame({ type: "agent_end", isTerminal: true }), {
    kind: "agent.end",
    isTerminal: true,
  });
  assert.deepEqual(
    mapOmpFrame({
      type: "prompt_result",
      status: "completed",
      agentInvoked: true,
      sessionSettled: true,
    }),
    {
      kind: "prompt.result",
      status: "completed",
      agentInvoked: true,
      sessionSettled: true,
    },
  );
  assert.deepEqual(mapOmpFrame({ type: "session_settled" }), {
    kind: "session.settled",
  });
});

test("maps tool frames and ignores unknown frames", () => {
  assert.deepEqual(
    mapOmpFrame({ type: "tool_execution_start", toolName: "bash", toolCallId: "t1" }),
    { kind: "tool.start", toolName: "bash", toolCallId: "t1" },
  );
  assert.equal(
    mapOmpFrame({ type: "extension_ui_request", method: "setWidget" }),
    null,
  );
});

test("normalizeMessage never invents content", () => {
  assert.deepEqual(normalizeMessage(undefined), {
    role: "assistant",
    text: "",
    thinking: "",
    toolCalls: [],
  });
  const message = normalizeMessage({
    role: "assistant",
    content: [
      { type: "text", text: "a" },
      { type: "unknown", value: 1 },
      { type: "toolCall", id: "c1", name: "read" },
    ],
  });
  assert.equal(message.text, "a");
  assert.deepEqual(message.toolCalls, [{ id: "c1", name: "read" }]);
});