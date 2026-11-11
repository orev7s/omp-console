import { promises as fs } from "node:fs";
import { dirname } from "node:path";

/** Read JSON, returning `fallback` when the file does not exist. */
export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

/**
 * Write JSON atomically: write to a temp file, fsync it, then rename over the
 * destination. A crash never leaves a partially written state file.
 */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const data = JSON.stringify(value, null, 2);
  const handle = await fs.open(tmp, "w");
  try {
    await handle.writeFile(data, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, path);
}
