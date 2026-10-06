import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, originAllowed, securityHeaders } from './security';

describe('security headers (S4-6)', () => {
  it('T-S4-I5 · production responses carry CSP, HSTS, frame and permission policies', () => {
    const h = Object.fromEntries(securityHeaders({ dev: false, https: true }).map((x) => [x.key, x.value]));
    expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(h['Content-Security-Policy']).toContain("object-src 'none'");
    expect(h['Content-Security-Policy']).not.toContain('unsafe-eval');
    expect(h['Strict-Transport-Security']).toMatch(/max-age=31536000/);
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Permissions-Policy']).toContain('camera=(self)');
    expect(h['Permissions-Policy']).toContain('display-capture=(self)');
  });

  it('dev relaxes CSP for HMR; plain-http origins get no HSTS or upgrade-insecure-requests', () => {
    expect(contentSecurityPolicy({ dev: true, https: false })).toContain('unsafe-eval');
    const http = securityHeaders({ dev: false, https: false });
    expect(http.map((x) => x.key)).not.toContain('Strict-Transport-Security');
    expect(contentSecurityPolicy({ dev: false, https: false })).not.toContain('upgrade-insecure-requests');
    expect(contentSecurityPolicy({ dev: false, https: true })).toContain('upgrade-insecure-requests');
  });
});

describe('Cloudflare origin lock', () => {
  it('T-S4-I2 · rejects a missing or wrong origin secret, allows the right one and the health check', () => {
    expect(originAllowed('/', null, 's3cret')).toBe(false);
    expect(originAllowed('/', 'wrong!', 's3cret')).toBe(false);
    expect(originAllowed('/', 's3cret', 's3cret')).toBe(true);
    expect(originAllowed('/api/health', null, 's3cret')).toBe(true);
  });

  it('is off when no secret is configured', () => {
    expect(originAllowed('/', null, undefined)).toBe(true);
  });
});

describe('no secrets in the browser bundle', () => {
  it('S4-7 · NEXT_PUBLIC_ variables are only the known public ones', () => {
    const env = readFileSync(path.resolve(import.meta.dirname, '../../../.env.example'), 'utf8');
    const publicVars = [...env.matchAll(/^(NEXT_PUBLIC_[A-Z0-9_]+)=/gm)].map((m) => m[1]).sort();
    expect(publicVars).toEqual(['NEXT_PUBLIC_SOLANA_RPC', 'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID']);
    expect(publicVars.join()).not.toMatch(/SECRET|PRIVATE|KEY$|TOKEN|PASSWORD/);
  });
});

describe('APP_ORIGIN normalisation', () => {
  it('matches the browser Origin header whatever was pasted', async () => {
    const { normalizeOrigin } = await import('./site');
    expect(normalizeOrigin('https://apecamweb-production.up.railway.app/')).toBe(
      'https://apecamweb-production.up.railway.app',
    );
    expect(normalizeOrigin(' "https://apecam.xyz/path?x=1" ')).toBe('https://apecam.xyz');
    expect(normalizeOrigin('apecam.xyz')).toBe('https://apecam.xyz');
    expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeOrigin(undefined)).toBe('http://localhost:3000');
    expect(normalizeOrigin('')).toBe('http://localhost:3000');
  });
});
