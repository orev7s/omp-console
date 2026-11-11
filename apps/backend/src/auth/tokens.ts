import { createHash } from "node:crypto";

/** Device tokens are high entropy, so a fast hash is appropriate here. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
