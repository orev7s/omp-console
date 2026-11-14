import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

export type ConfinementMode = "unrestricted" | "restricted";

export interface SpawnCommand {
  bin: string;
  args: string[];
}

export interface SandboxOptions {
  mode: ConfinementMode;
  ompBin: string;
  ompArgs: string[];
  /** Working directory and the only writable project path in restricted mode. */
  workspace: string;
  /** Writable per-session home, mounted at the same absolute path. */
  homeDir: string;
}

const SYSTEM_RO_BINDS = [
  "/usr",
  "/bin",
  "/sbin",
  "/lib",
  "/lib64",
  "/lib32",
  "/etc",
];

/**
 * Builds the child command. `restricted` runs `omp` inside a bubblewrap mount
 * namespace with only the workspace and a private home writable. Network stays
 * shared because the agent must reach model providers.
 *
 * If bubblewrap is missing the caller must refuse to start rather than fall back
 * to unrestricted. That check lives in `assertSandboxAvailable`.
 */
export function buildSpawnCommand(options: SandboxOptions): SpawnCommand {
  if (options.mode === "unrestricted") {
    return { bin: options.ompBin, args: [...options.ompArgs] };
  }

  const binds: string[] = [
    "--die-with-parent",
    "--unshare-pid",
    "--new-session",
    // The root must be a writable tmpfs, otherwise bwrap cannot create the
    // mount points (/dev, /proc, the workspace) inside the sandbox.
    "--tmpfs",
    "/",
  ];
  for (const path of SYSTEM_RO_BINDS) {
    if (existsSync(path)) binds.push("--ro-bind", path, path);
  }

  // The omp binary may live outside the standard prefixes. A relative name
  // such as "omp" has dirname "."; binding "." would make the sandbox root
  // read-only, so resolve the binary first and never bind ".".
  const binDir = dirname(options.ompBin);
  if (
    binDir !== "." &&
    binDir !== "/" &&
    !SYSTEM_RO_BINDS.some(
      (path) => binDir === path || binDir.startsWith(`${path}/`),
    )
  ) {
    binds.push("--ro-bind", binDir, binDir);
  }

  // /etc/resolv.conf is often a symlink into /run, which the sandbox does not
  // otherwise mount. Bind the resolved file at its real path so DNS works
  // without exposing the whole of /run.
  try {
    const resolvConf = "/etc/resolv.conf";
    if (existsSync(resolvConf)) {
      const resolved = realpathSync(resolvConf);
      if (resolved !== resolvConf) {
        binds.push("--ro-bind", resolved, resolved);
      }
    }
  } catch {
    // No resolver file is a valid (if offline) setup.
  }

  binds.push(
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp",
    "--bind",
    options.workspace,
    options.workspace,
    "--bind",
    options.homeDir,
    options.homeDir,
    "--chdir",
    options.workspace,
    "--",
    options.ompBin,
    ...options.ompArgs,
  );

  return { bin: "bwrap", args: binds };
}

/**
 * Resolves a bare binary name through PATH. Sandboxing needs an absolute path
 * because the child's cwd is the workspace, not the caller's cwd.
 */
export function resolveOmpBinary(bin: string): string {
  if (isAbsolute(bin)) return bin;
  for (const dir of (process.env["PATH"] ?? "").split(":")) {
    if (dir.length === 0) continue;
    const candidate = join(dir, bin);
    if (existsSync(candidate)) return candidate;
  }
  return bin;
}

export function assertSandboxAvailable(mode: ConfinementMode): void {
  if (mode !== "restricted") return;
  const found = ["/usr/bin/bwrap", "/bin/bwrap", "/usr/local/bin/bwrap"].some(
    (path) => existsSync(path),
  );
  if (!found) {
    throw new Error(
      "restricted confinement is configured but bubblewrap (bwrap) is not installed; install it or switch the mode to unrestricted",
    );
  }
}