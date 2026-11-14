/** L2 protocol version. Independent of L1 (app) and L3 (OMP RPC). */
export const AGENT_PROTOCOL_VERSION = 1 as const;

/** Default file name of the local Unix socket. */
export const AGENT_SOCKET_FILENAME = "agent-host.sock" as const;

/** Default file name of the single-instance lock. */
export const AGENT_LOCK_FILENAME = "agent-host.lock" as const;

/** Default file name of the child registry used for orphan reconciliation. */
export const AGENT_CHILD_STATE_FILENAME = "children.json" as const;