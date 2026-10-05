// Automated part of the smoke test (Sprint Tasks §J), for staging QA days and right after every production
// deploy (L-4 / T-L-M1). Read-only: it never signs in, posts, or changes anything.
//   node tests/smoke/smoke.mjs https://apecam.xyz
//   node tests/smoke/smoke.mjs http://localhost:3000 --allow-degraded   (no Redis locally → health 503)
// The manual rows (wallet logins, going live on camera/screen, chat between two devices, iPhone) stay manual.

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const ALLOW_DEGRADED = process.argv.includes('--allow-degraded');
const HTTPS = BASE.startsWith('https://');

const results = [];
async function check(id, name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    results.push({ id, name, ok: true, ms: Math.round(performance.now() - t0), detail: detail ?? '' });
  } catch (err) {
    results.push({ id, name, ok: false, ms: Math.round(performance.now() - t0), detail: err.message });
  }
}

async function get(path, init) {
  const res = await fetch(BASE + path, { redirect: 'manual', ...init });
  const body = await res.text();
  return { res, body, json: () => JSON.parse(body) };
}
function expectStatus(res, ...ok) {
  if (!ok.includes(res.status)) throw new Error(`HTTP ${res.status}, expected ${ok.join('/')}`);
}

await check('J1', '/api/health', async () => {
  const { res, body } = await get('/api/health');
  if (ALLOW_DEGRADED) expectStatus(res, 200, 503);
  else expectStatus(res, 200);
  return body.slice(0, 120);
});

await check('J5', 'Home + three feed tabs', async () => {
  expectStatus((await get('/')).res, 200);
  const counts = [];
  for (const tab of ['live', 'trending', 'new']) {
    const r = await get(`/api/streams/live?tab=${tab}`);
    expectStatus(r.res, 200);
    counts.push(`${tab} ${r.json().items.length}`);
  }
  return counts.join(' · ');
});

await check('J8', 'Search by ticker', async () => {
  const r = await get('/api/tokens/search?q=pepe');
  expectStatus(r.res, 200);
  return `${r.json().results.length} results`;
});

await check('J13', '/burn + tracker freshness', async () => {
  expectStatus((await get('/burn')).res, 200);
  const r = await get('/api/tracker/summary');
  if (r.res.status === 503) return 'tracker not configured yet';
  expectStatus(r.res, 200);
  const synced = r.json().lastSyncedAt;
  if (!synced) throw new Error('tracker never synced');
  const mins = (Date.now() - new Date(synced).getTime()) / 60_000;
  if (mins > 30) throw new Error(`last synced ${Math.round(mins)} min ago (alert threshold 30)`);
  return `last synced ${Math.round(mins)} min ago`;
});

await check('J14', 'About, Rules, Terms, Privacy', async () => {
  for (const p of ['/about', '/rules', '/terms', '/privacy']) {
    const r = await get(p);
    expectStatus(r.res, 200);
    if (/pending legal review/i.test(r.body) && HTTPS) return `${p} still marked "pending legal review"`;
  }
  return 'all 200';
});

await check('SEC', 'Security headers', async () => {
  const { res } = await get('/about');
  const h = (k) => res.headers.get(k) ?? '';
  const missing = [];
  if (!h('content-security-policy').includes("frame-ancestors 'none'")) missing.push('CSP');
  if (h('x-frame-options') !== 'DENY') missing.push('X-Frame-Options');
  if (h('x-content-type-options') !== 'nosniff') missing.push('nosniff');
  if (!h('permissions-policy').includes('camera=(self)')) missing.push('Permissions-Policy');
  if (HTTPS && !h('strict-transport-security')) missing.push('HSTS');
  if (res.headers.has('x-powered-by')) missing.push('x-powered-by present');
  if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
  return HTTPS ? 'incl. HSTS' : 'HSTS skipped (http)';
});

await check('SEC', 'Admin API needs a session', async () => {
  expectStatus((await get('/api/admin/reports')).res, 401);
});

await check('SEC', 'Cross-site POST refused', async () => {
  const { res } = await get('/api/reports', {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: '{}',
  });
  expectStatus(res, 403);
});

await check('SEO', 'robots.txt, sitemap.xml, 404', async () => {
  const robots = await get('/robots.txt');
  expectStatus(robots.res, 200);
  if (!robots.body.includes('Disallow: /admin')) throw new Error('robots.txt does not block /admin');
  if (HTTPS && !robots.body.includes(BASE))
    throw new Error(`robots.txt sitemap is not on ${BASE} (APP_ORIGIN at build?)`);
  expectStatus((await get('/sitemap.xml')).res, 200);
  expectStatus((await get('/definitely-not-a-page')).res, 404);
});

await check('BETA', 'Go Live access mode', async () => {
  const r = await get('/api/public-config');
  expectStatus(r.res, 200);
  const { goLiveAccess, feedbackUrl } = r.json();
  return `go live: ${goLiveAccess}${feedbackUrl ? ' · feedback link set' : ''}`;
});

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(4)} ${r.name.padEnd(width)}  ${String(r.ms).padStart(5)} ms  ${r.detail}`,
  );
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed against ${BASE}`);
process.exitCode = failed ? 1 : 0;
