import { describe, expect, it } from 'vitest';
import { poolConfig } from './client';

const URL_ =
  'postgresql://postgres.ref:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require';

describe('poolConfig (managed Postgres / Supabase)', () => {
  it('defaults: URL untouched, no explicit TLS, pool size as requested', () => {
    expect(poolConfig(URL_, 10, {})).toEqual({ connectionString: URL_, max: 10 });
  });

  it('DATABASE_POOL_MAX lowers the pool, never raises it, and ignores junk', () => {
    expect(poolConfig(URL_, 10, { DATABASE_POOL_MAX: '4' }).max).toBe(4);
    expect(poolConfig(URL_, 1, { DATABASE_POOL_MAX: '4' }).max).toBe(1); // migrations keep one connection
    expect(poolConfig(URL_, 10, { DATABASE_POOL_MAX: 'abc' }).max).toBe(10);
    expect(poolConfig(URL_, 10, { DATABASE_POOL_MAX: '0' }).max).toBe(10);
  });

  it('DATABASE_CA_CERT: verifying TLS with that CA, and URL ssl params removed so they cannot override it', () => {
    const cfg = poolConfig(URL_, 10, {
      DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\\nMIIB\\n-----END CERTIFICATE-----',
    });
    expect(cfg.ssl).toEqual({
      ca: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
      rejectUnauthorized: true,
    });
    expect(cfg.connectionString).not.toContain('sslmode');
    expect(cfg.connectionString).toContain('pooler.supabase.com:5432/postgres');
    expect(cfg.connectionString).toContain('postgres.ref:pw@');
  });
});
