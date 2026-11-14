import { open, readFile, unlink } from "node:fs/promises";

/**
 * Single-instance lock. Uses exclusive file creation, not flock, so it works
 * without native modules. A stale lock whose pid is gone is reclaimed.
 */
export class InstanceLock {
  private held = false;

  constructor(private readonly path: string) {}

  async acquire(): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(this.path, "wx", 0o600);
        try {
          await handle.writeFile(`${process.pid}\n`, "utf8");
        } finally {
          await handle.close();
        }
        this.held = true;
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const pid = await readPid(this.path);
        if (pid !== null && isAlive(pid)) {
          throw new Error(
            `another agent host is already running (pid ${pid}); lock: ${this.path}`,
          );
        }
        await unlink(this.path).catch(() => {});
      }
    }
    throw new Error(`could not acquire the agent host lock: ${this.path}`);
  }

  async release(): Promise<void> {
    if (!this.held) return;
    this.held = false;
    await unlink(this.path).catch(() => {});
  }
}

async function readPid(path: string): Promise<number | null> {
  try {
    const raw = await readFile(path, "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}