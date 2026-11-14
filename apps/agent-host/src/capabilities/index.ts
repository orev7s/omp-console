import { execFile } from "node:child_process";
import type { OmpFrame } from "../rpc/frames.js";

/** Reads the `omp --version` line. Returns null when the binary cannot run. */
export function readOmpVersion(binPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      binPath,
      ["--version"],
      { timeout: 10_000 },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const line = stdout
          .split("\n")
          .map((value) => value.trim())
          .find((value) => value.length > 0);
        resolve(line ?? null);
      },
    );
  });
}

/** Collects command names from OMP's startup `available_commands_update`. */
export function commandsFromFrame(frame: OmpFrame): string[] | null {
  if (frame.type !== "available_commands_update") return null;
  const commands = frame["commands"];
  if (!Array.isArray(commands)) return null;
  const names: string[] = [];
  for (const command of commands) {
    if (typeof command !== "object" || command === null) continue;
    const name = (command as Record<string, unknown>)["name"];
    if (typeof name === "string" && name.length > 0) names.push(name);
  }
  return names;
}