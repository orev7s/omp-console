/**
 * URL builders for the control plane. Pure functions so they are unit testable
 * without a device. This is the only place that decides the scheme from the
 * connection mode.
 */
import type { ConnectionMode } from '@omp-console/protocol';

export interface ServerTarget {
  host: string;
  port: number;
  mode: ConnectionMode;
}

export interface ServerUrls {
  http: string;
  ws: string;
  secure: boolean;
}

export function isSecureMode(mode: ConnectionMode): boolean {
  return mode !== 'http';
}

function hostFor(host: string): string {
  const trimmed = host.trim();
  // Wrap IPv6 literals in brackets for URL construction.
  if (trimmed.includes(':') && !trimmed.startsWith('[')) {
    return `[${trimmed}]`;
  }
  return trimmed;
}

export function buildUrls(target: ServerTarget): ServerUrls {
  const secure = isSecureMode(target.mode);
  const scheme = secure ? 'https' : 'http';
  const wsScheme = secure ? 'wss' : 'ws';
  const authority = `${hostFor(target.host)}:${target.port}`;
  return {
    http: `${scheme}://${authority}`,
    ws: `${wsScheme}://${authority}/v1/ws`,
    secure,
  };
}
