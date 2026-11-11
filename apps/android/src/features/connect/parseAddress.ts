/**
 * Turns one human address string into a host and port. Pure and unit tested.
 * Accepts `host`, `host:port`, `[ipv6]:port`, or a full URL.
 */
export interface ParsedAddress {
  host: string;
  port: number;
}

export type ParseAddressResult =
  | { ok: true; value: ParsedAddress }
  | { ok: false; error: string };

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const BRACKETED_V6 = /^\[([0-9a-fA-F:.]+)\](?::(\d+))?$/;

function validPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function parseAddress(input: string, fallbackPort: number): ParseAddressResult {
  let value = input.trim();
  if (value === '') {
    return { ok: false, error: 'Enter your server address.' };
  }
  if (/\s/.test(value)) {
    return { ok: false, error: 'That address has a space in it. Check it and try again.' };
  }

  value = value.replace(SCHEME, '');
  const slash = value.indexOf('/');
  if (slash >= 0) value = value.slice(0, slash);
  if (value === '') {
    return { ok: false, error: 'Enter your server address.' };
  }

  const bracketed = value.match(BRACKETED_V6);
  if (bracketed) {
    const host = bracketed[1];
    const port = bracketed[2] ? Number(bracketed[2]) : fallbackPort;
    if (!validPort(port)) {
      return { ok: false, error: 'That port does not look right. Use a number from 1 to 65535.' };
    }
    return { ok: true, value: { host, port } };
  }

  const colonCount = (value.match(/:/g) ?? []).length;
  if (colonCount === 0) {
    return { ok: true, value: { host: value, port: fallbackPort } };
  }

  if (colonCount === 1) {
    const [host, rawPort] = value.split(':');
    if (host === '') {
      return { ok: false, error: 'Enter your server address.' };
    }
    if (!/^\d+$/.test(rawPort)) {
      return { ok: false, error: 'That port does not look right. Use a number from 1 to 65535.' };
    }
    const port = Number(rawPort);
    if (!validPort(port)) {
      return { ok: false, error: 'That port does not look right. Use a number from 1 to 65535.' };
    }
    return { ok: true, value: { host, port } };
  }

  // More than one colon and no brackets: treat it as a bare IPv6 literal.
  return { ok: true, value: { host: value, port: fallbackPort } };
}

/** Formats a saved config back into the single address field. */
export function formatAddress(host: string, port: number, defaultPort: number): string {
  if (!host) return '';
  if (host.includes(':')) {
    return port === defaultPort ? `[${host}]` : `[${host}]:${port}`;
  }
  return port === defaultPort ? host : `${host}:${port}`;
}