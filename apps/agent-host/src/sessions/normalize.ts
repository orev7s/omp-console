import type {
  ModelInfo,
  NormalizedMessage,
} from "@omp-console/agent-protocol";
import { normalizeMessage } from "../events/mapper.js";

/**
 * Shape-tolerant translation across the L2 and omp boundary: command responses
 * into L2 values, and the single L2 model string into the provider and model id
 * omp wants. omp's response shapes are only partly documented, so every reader
 * is defensive: an unexpected shape yields an empty result, never an exception.
 * These functions never touch the wire; the session manager owns the RPC calls.
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Pull message objects out of a `get_messages`-style response. */
export function normalizedMessages(data: unknown): NormalizedMessage[] {
  return messageRecords(data).map((record) => normalizeMessage(record));
}

/** Pull `ModelInfo` entries out of the `get_available_models` response. */
export function normalizedModels(data: unknown): ModelInfo[] {
  const models: ModelInfo[] = [];
  for (const record of modelRecords(data)) {
    const info = toModelInfo(record);
    if (info !== null) models.push(info);
  }
  return models;
}

/** A session stats object; `{}` when omp answers with anything else. */
export function normalizedStats(data: unknown): Record<string, unknown> {
  const record = asRecord(data);
  if (record === null) return {};
  const nested = asRecord(record["stats"]);
  return nested ?? record;
}

/** One `get_messages_page` response as messages plus the next cursor. */
export function normalizedMessagesPage(data: unknown): {
  messages: NormalizedMessage[];
  nextCursor: string | null;
} {
  const record = asRecord(data);
  return {
    messages: messageRecords(data).map((entry) => normalizeMessage(entry)),
    nextCursor:
      record === null
        ? null
        : firstString(record, ["nextCursor", "next_cursor"]),
  };
}

function modelRecords(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const record = asRecord(data);
  const models = record?.["models"];
  return Array.isArray(models) ? models : [];
}

function messageRecords(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const record = asRecord(data);
  const messages = record?.["messages"];
  return Array.isArray(messages) ? messages : [];
}

/** One model, tolerant of the omp `Model` shape (id, name, provider). */
function toModelInfo(value: unknown): ModelInfo | null {
  if (typeof value === "string" && value.length > 0) return { id: value };
  const record = asRecord(value);
  if (record === null) return null;
  const id = firstString(record, ["id", "modelId", "model"]);
  if (id === null) return null;
  const name = firstString(record, ["name"]);
  const provider = firstString(record, ["provider"]);
  return {
    id,
    ...(name === null ? {} : { name }),
    ...(provider === null ? {} : { provider }),
  };
}

function firstString(
  record: Record<string, unknown>,
  names: string[],
): string | null {
  for (const name of names) {
    const value = record[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/**
 * omp's `set_model` wants a provider and a model id apart while L2 carries one
 * string. A `provider/modelId` value splits on the first slash; otherwise the
 * whole value is sent for both so omp can report a clear selection error.
 */
export function splitModelRef(model: string): {
  provider: string;
  modelId: string;
} {
  const slash = model.indexOf("/");
  if (slash > 0 && slash < model.length - 1) {
    return { provider: model.slice(0, slash), modelId: model.slice(slash + 1) };
  }
  return { provider: model, modelId: model };
}
