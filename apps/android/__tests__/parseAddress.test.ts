import { formatAddress, parseAddress } from '../src/features/connect/parseAddress';

function parse(input: string, fallback = 443) {
  return parseAddress(input, fallback);
}

describe('parseAddress', () => {
  it('accepts a bare host with the fallback port', () => {
    expect(parse('vps.example.com')).toEqual({
      ok: true,
      value: { host: 'vps.example.com', port: 443 },
    });
  });

  it('accepts host:port', () => {
    expect(parse('127.0.0.1:5174')).toEqual({
      ok: true,
      value: { host: '127.0.0.1', port: 5174 },
    });
  });

  it('accepts a full URL and drops the path', () => {
    expect(parse('https://vps.example.com:8722/v1/health')).toEqual({
      ok: true,
      value: { host: 'vps.example.com', port: 8722 },
    });
  });

  it('accepts a bracketed IPv6 with a port', () => {
    expect(parse('[2001:db8::1]:8722')).toEqual({
      ok: true,
      value: { host: '2001:db8::1', port: 8722 },
    });
  });

  it('accepts a bare IPv6 literal with the fallback port', () => {
    expect(parse('2001:db8::1', 80)).toEqual({
      ok: true,
      value: { host: '2001:db8::1', port: 80 },
    });
  });

  it('uses the supplied fallback for the insecure mode', () => {
    expect(parse('vps.example.com', 80)).toEqual({
      ok: true,
      value: { host: 'vps.example.com', port: 80 },
    });
  });

  it('rejects an empty address', () => {
    const result = parse('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/enter your server address/i);
  });

  it('rejects whitespace inside the address', () => {
    const result = parse('vps .example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/space/i);
  });

  it('rejects a non-numeric port', () => {
    const result = parse('vps.example.com:abc');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/port/i);
  });

  it('rejects an out-of-range port', () => {
    const result = parse('vps.example.com:70000');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/1 to 65535/);
  });
});

describe('formatAddress', () => {
  it('omits the default port', () => {
    expect(formatAddress('vps.example.com', 443, 443)).toBe('vps.example.com');
  });

  it('includes a non-default port', () => {
    expect(formatAddress('vps.example.com', 8722, 443)).toBe('vps.example.com:8722');
  });

  it('brackets IPv6 and appends the port', () => {
    expect(formatAddress('2001:db8::1', 8722, 443)).toBe('[2001:db8::1]:8722');
  });
});