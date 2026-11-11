import { randomBytes } from "node:crypto";

/** Crockford-style alphabet without ambiguous characters. */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function base64url(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

/** URL-safe opaque identifier. */
export function randomId(bytes = 12): string {
  return base64url(bytes);
}

/** High-entropy secret used as a bearer token. */
export function randomToken(bytes = 32): string {
  return base64url(bytes);
}

/** Short human-enterable pairing code. */
export function pairingCode(length = 8): string {
  const raw = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const index = (raw[i] ?? 0) % CODE_ALPHABET.length;
    out += CODE_ALPHABET[index];
  }
  return out;
}

export function requestId(): string {
  return `req_${base64url(9)}`;
}

export function connectionId(): string {
  return `conn_${base64url(9)}`;
}
