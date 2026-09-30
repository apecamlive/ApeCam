import { createServer } from 'node:http';
import { coreDepsFromEnv, JOB_EXPECTED_GAP_MS, recordJobRun } from '@apecam/core';
import { MemoryKeyValueStore, RedisKeyValueStore, runHealthChecks, type HealthCheck } from '@apecam/shared';
import { Queue, Worker } from 'bullmq';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { JOBS } from './jobs';

const env = process.env;
const QUEUE = 'apecam-jobs';

// BullMQ needs its own connection with maxRetriesPerRequest: null (blocking commands).
const redis = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, family: 0 }) : undefined;
const kv = redis ? new RedisKeyValueStore(redis) : new MemoryKeyValueStore();
const deps = coreDepsFromEnv(env, kv);

async function runJob(name: string) {
  const job = JOBS.find((j) => j.name === name);
  if (!job) throw new Error(`unknown job ${name}`);
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  try {
    const result = await job.run(deps);
    deps.log?.info({ job: name, ms: ms(), result }, 'job done');
    await recordJobRun(deps, name, { ok: true, ms: ms() }).catch(() => undefined);
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordJobRun(deps, name, { ok: false, ms: ms(), error }).catch(() => undefined);
    throw err;
  }
}

// Every scheduled job must be known to the admin Health tab (and vice versa).
const unknown = JOBS.map((j) => j.name).filter((n) => !(n in JOB_EXPECTED_GAP_MS));
if (unknown.length) throw new Error(`jobs missing from JOB_EXPECTED_GAP_MS: ${unknown.join(', ')}`);

let stop: () => Promise<void>;
if (redis) {
  // Job schedulers are idempotent upserts, so every deploy (or a second replica) converges on one schedule.
  const queue = new Queue(QUEUE, { connection: redis });
  for (const job of JOBS) {
    await queue.upsertJobScheduler(
      job.name,
      job.cron ? { pattern: job.cron, tz: 'UTC' } : { every: job.everyMs },
      { name: job.name, opts: { removeOnComplete: 100, removeOnFail: 500 } },
    );
  }
  const worker = new Worker(QUEUE, (j) => runJob(j.name), { connection: redis, concurrency: 4 });
  worker.on('failed', (j, err) => deps.log?.error({ job: j?.name, err: err.stack }, 'job failed'));
  stop = async () => {
    await worker.close();
    await queue.close();
  };
} else {
  // Local dev without Redis: plain timers, single process only. Cron jobs (daily close) are run by hand.
  deps.log?.warn({}, 'REDIS_URL not set: running interval jobs on local timers; cron jobs are skipped');
  const timers = JOBS.filter((job) => job.everyMs).map((job) =>
    setInterval(
      () =>
        runJob(job.name).catch((err) => deps.log?.error({ job: job.name, err: String(err) }, 'job failed')),
      job.everyMs,
    ),
  );
  stop = async () => timers.forEach(clearInterval);
}

const checks: Record<string, HealthCheck> = {
  database: async () => void (await deps.db.execute(sql`select 1`)),
  redis: redis
    ? async () => void (await redis.ping())
    : async () => Promise.reject(new Error('REDIS_URL not set')),
};

const port = Number(env.PORT ?? 8081);
createServer(async (req, res) => {
  if (req.url !== '/health') {
    res.writeHead(404).end();
    return;
  }
  const report = await runHealthChecks(checks);
  res.writeHead(report.ok ? 200 : 503, { 'content-type': 'application/json' }).end(JSON.stringify(report));
}).listen(port, () => deps.log?.info({ port, jobs: JOBS.map((j) => j.name) }, 'worker started'));

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    await stop();
    await Promise.allSettled([deps.close(), redis?.quit()]);
    process.exit(0);
  });
}
