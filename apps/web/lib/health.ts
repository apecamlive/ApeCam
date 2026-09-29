import { runHealthChecks, type HealthCheck } from '@apecam/shared';
import { Redis } from 'ioredis';
import pg from 'pg';

// One client per server process. Railway injects DATABASE_URL / REDIS_URL via service references.
let pool: pg.Pool | undefined;
let redis: Redis | undefined;

function getPool(url: string) {
  pool ??= new pg.Pool({ connectionString: url, max: 5 });
  return pool;
}

function getRedis(url: string) {
  redis ??= new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true, family: 0 });
  return redis;
}

export function appHealth() {
  const checks: Record<string, HealthCheck> = {};
  const dbUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;

  checks.database = dbUrl
    ? async () => void (await getPool(dbUrl).query('select 1'))
    : async () => Promise.reject(new Error('DATABASE_URL not set'));
  checks.redis = redisUrl
    ? async () => {
        const client = getRedis(redisUrl);
        if (client.status === 'wait') await client.connect();
        await client.ping();
      }
    : async () => Promise.reject(new Error('REDIS_URL not set'));

  return runHealthChecks(checks);
}
