// T-S4-L2: Home feed at 200 RPS for 5 minutes; p95 < 300 ms, errors < 0.5%.
//   k6 run -e BASE_URL=https://staging.apecam.xyz tests/load/k6-feed.js
// Run against STAGING only. Send a header the app's per-IP rate limit does not see as one client:
// allow-list the k6 runner IP in Cloudflare, or run it from several IPs (k6 cloud).
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    feed: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RPS || 200),
      timeUnit: '1s',
      duration: __ENV.DURATION || '5m',
      preAllocatedVUs: 100,
      maxVUs: 400,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.005'],
  },
};

const TABS = ['live', 'trending', 'new'];

export default function () {
  const tab = TABS[Math.floor(Math.random() * TABS.length)];
  const res = http.get(`${BASE}/api/streams/live?tab=${tab}`, { tags: { name: 'feed' } });
  check(res, { 'status 200': (r) => r.status === 200 });
}
