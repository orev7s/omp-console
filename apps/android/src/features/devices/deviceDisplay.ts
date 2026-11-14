import type { Scope } from '@omp-console/protocol';

export function lastSeenLabel(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'Never connected';
  const date = new Date(lastSeenAt);
  if (Number.isNaN(date.getTime())) return 'Last seen unknown';
  return `Last seen ${date.toLocaleDateString()}`;
}

export function scopesLabel(scopes: readonly Scope[]): string {
  if (scopes.length === 0) return 'No access';
  if (scopes.length === 3) return 'Full access';
  if (scopes.length === 1 && scopes[0] === 'read') return 'Read only';
  return scopes.join(' + ');
}

export function deviceMeta(
  scopes: readonly Scope[],
  lastSeenAt: string | null,
  tokenExpiresAt: string | null,
): string {
  const parts = [scopesLabel(scopes), lastSeenLabel(lastSeenAt)];
  if (tokenExpiresAt) {
    const date = new Date(tokenExpiresAt);
    if (!Number.isNaN(date.getTime())) parts.push(`Token expires ${date.toLocaleDateString()}`);
  }
  return parts.join(' · ');
}