import { readFile } from "node:fs/promises";

/**
 * The on-disk shape of a session record in `index.json`. Fields added after a
 * format shipped stay optional here and are normalized to null on load, so an
 * older index still parses instead of being dropped.
 */
export interface PersistedSessionBase {
  id: string;
  cwd: string;
  model: string | null;
  thinkingLevel: string | null;
  homeDir: string;
  sessionDir: string;
  createdAt: string;
}

export interface PersistedSession extends PersistedSessionBase {
  /** Null until the first user message names the session. */
  title: string | null;
}

/** Read and shape-check the session index. A missing or corrupt file is empty. */
export async function readSessionIndex(
  path: string,
): Promise<PersistedSession[]> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return [];
    const sessions = (parsed as Record<string, unknown>)["sessions"];
    if (!Array.isArray(sessions)) return [];
    return sessions.filter(isPersistedSession).map(toPersistedSession);
  } catch {
    return [];
  }
}

/** Title and thinking level were added after the first index format. */
function toPersistedSession(record: PersistedSessionBase): PersistedSession {
  const title = (record as { title?: unknown }).title;
  const thinkingLevel = (record as { thinkingLevel?: unknown }).thinkingLevel;
  return {
    ...record,
    title: typeof title === "string" && title.length > 0 ? title : null,
    thinkingLevel:
      typeof thinkingLevel === "string" && thinkingLevel.length > 0
        ? thinkingLevel
        : null,
  };
}

function isPersistedSession(value: unknown): value is PersistedSessionBase {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const thinkingLevel = record["thinkingLevel"];
  return (
    typeof record["id"] === "string" &&
    typeof record["cwd"] === "string" &&
    (typeof record["model"] === "string" || record["model"] === null) &&
    (thinkingLevel === undefined ||
      typeof thinkingLevel === "string" ||
      thinkingLevel === null) &&
    typeof record["homeDir"] === "string" &&
    typeof record["sessionDir"] === "string" &&
    typeof record["createdAt"] === "string"
  );
}
