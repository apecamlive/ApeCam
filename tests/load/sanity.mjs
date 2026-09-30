// Local sanity load test without k6: fixed concurrency against a running server, prints p50/p95/p99.
//   node tests/load/sanity.mjs [baseUrl] [seconds] [concurrency]
// Each simulated client sends a different X-Forwarded-For so the per-IP rate limit does not dominate
// (only meaningful locally, where the app trusts that header; behind Cloudflare CF-Connecting-IP wins).

const BASE = process.argv[2] ?? 'http://localhost:3000';
const SECONDS = Number(process.argv[3] ?? 20);
const CONCURRENCY = Number(process.argv[4] ?? 20);

const TARGETS = [
  { name: 'feed', path: '/api/streams/live?tab=live' },
  { name: 'tracker', path: '/api/tracker/summary', okStatuses: [200, 503] },
  { name: 'health', path: '/api/health' },
  { name: 'home html', path: '/' },
];

function pct(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;
}

async function client(id, target, until, stats) {
  const ip = `10.${(id >> 8) & 255}.${id & 255}.${Math.floor(Math.random() * 255)}`;
  while (Date.now() < until) {
    const t0 = performance.now();
    let ok = false;
    try {
      const res = await fetch(BASE + target.path, { headers: { 'x-forwarded-for': ip } });
      await res.arrayBuffer();
      ok = (target.okStatuses ?? [200]).includes(res.status);
      if (!ok) stats.statuses[res.status] = (stats.statuses[res.status] ?? 0) + 1;
    } catch {
      stats.statuses.network = (stats.statuses.network ?? 0) + 1;
    }
    stats.latencies.push(performance.now() - t0);
    if (!ok) stats.errors++;
  }
}

let failed = false;
for (const target of TARGETS) {
  const stats = { latencies: [], errors: 0, statuses: {} };
  const until = Date.now() + (SECONDS * 1000) / TARGETS.length;
  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => client(i + 1, target, until, stats)));
  const secs = (Date.now() - started) / 1000;
  const sorted = stats.latencies.sort((a, b) => a - b);
  const errRate = stats.errors / Math.max(1, sorted.length);
  const line = {
    target: target.name,
    requests: sorted.length,
    rps: Math.round(sorted.length / secs),
    p50: Math.round(pct(sorted, 50)),
    p95: Math.round(pct(sorted, 95)),
    p99: Math.round(pct(sorted, 99)),
    errorRate: `${(errRate * 100).toFixed(2)}%`,
    ...(Object.keys(stats.statuses).length ? { unexpected: stats.statuses } : {}),
  };
  console.log(JSON.stringify(line));
  if (errRate > 0.005) failed = true;
}
process.exitCode = failed ? 1 : 0;
