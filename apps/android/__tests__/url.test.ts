import { buildUrls, isSecureMode } from '../src/api/url';

describe('buildUrls', () => {
  it('uses https and wss for secure modes', () => {
    const urls = buildUrls({ host: 'vps.example.com', port: 443, mode: 'https_domain' });
    expect(urls.http).toBe('https://vps.example.com:443');
    expect(urls.ws).toBe('wss://vps.example.com:443/v1/ws');
    expect(urls.secure).toBe(true);
  });

  it('uses http and ws for the insecure mode', () => {
    const urls = buildUrls({ host: '203.0.113.5', port: 8722, mode: 'http' });
    expect(urls.http).toBe('http://203.0.113.5:8722');
    expect(urls.ws).toBe('ws://203.0.113.5:8722/v1/ws');
    expect(urls.secure).toBe(false);
  });

  it('brackets IPv6 literals', () => {
    const urls = buildUrls({ host: '2001:db8::1', port: 8722, mode: 'https_ip' });
    expect(urls.http).toBe('https://[2001:db8::1]:8722');
  });

  it('treats only http as insecure', () => {
    expect(isSecureMode('http')).toBe(false);
    expect(isSecureMode('https_domain')).toBe(true);
    expect(isSecureMode('https_ip')).toBe(true);
    expect(isSecureMode('https_private')).toBe(true);
  });
});
