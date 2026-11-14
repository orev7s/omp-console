import test from "node:test";
import assert from "node:assert/strict";
import { RestartPolicy } from "../src/supervisor/backoff.js";

test("doubles without jitter and caps at maxMs", () => {
  const policy = new RestartPolicy({
    baseMs: 100,
    maxMs: 1_000,
    maxAttempts: 5,
    jitterRatio: 0,
    random: () => 0.5,
  });
  assert.equal(policy.nextDelay(), 100);
  assert.equal(policy.nextDelay(), 200);
  assert.equal(policy.nextDelay(), 400);
  assert.equal(policy.nextDelay(), 800);
  assert.equal(policy.nextDelay(), 1_000);
  assert.equal(policy.nextDelay(), null);
});

test("jitter stays inside the configured ratio", () => {
  const policy = new RestartPolicy({
    baseMs: 1_000,
    maxMs: 10_000,
    maxAttempts: 10,
    jitterRatio: 0.2,
    random: () => 0,
  });
  assert.equal(policy.nextDelay(), 800);
  const high = new RestartPolicy({
    baseMs: 1_000,
    maxMs: 10_000,
    maxAttempts: 10,
    jitterRatio: 0.2,
    random: () => 1,
  });
  assert.equal(high.nextDelay(), 1_200);
});

test("reset re-arms the circuit", () => {
  const policy = new RestartPolicy({
    baseMs: 10,
    maxMs: 10,
    maxAttempts: 1,
    jitterRatio: 0,
  });
  assert.equal(policy.nextDelay(), 10);
  assert.equal(policy.nextDelay(), null);
  policy.reset();
  assert.equal(policy.nextDelay(), 10);
});