import { Redis } from 'ioredis';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

// Needs Postgres + Redis: `docker compose up -d` locally, service containers in CI.
const dbUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;

describe.skipIf(!dbUrl || !redisUrl)('T-S0-I1 · infrastructure', () => {
  const pool = new pg.Pool({ connectionString: dbUrl });
  const redis = new Redis(redisUrl ?? '', { lazyConnect: true });

  afterAll(async () => {
    await Promise.allSettled([pool.end(), redis.quit()]);
  });

  it('Postgres answers select 1', async () => {
    const { rows } = await pool.query('select 1 as one');
    expect(rows[0]).toEqual({ one: 1 });
  });

  it('Postgres has pg_trgm available (needed for ticker search)', async () => {
    const { rows } = await pool.query("select 1 from pg_available_extensions where name = 'pg_trgm'");
    expect(rows).toHaveLength(1);
  });

  it('Redis answers PING and supports GETDEL (single-use login nonces)', async () => {
    await redis.connect();
    expect(await redis.ping()).toBe('PONG');
    await redis.set('t-s0-i1', 'nonce', 'EX', 10);
    expect(await redis.getdel('t-s0-i1')).toBe('nonce');
    expect(await redis.get('t-s0-i1')).toBeNull();
  });
});
