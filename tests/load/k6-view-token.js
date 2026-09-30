// T-S4-L3: view-token at 50 RPS; p95 < 300 ms. Also exercises the token API.
//   k6 run -e BASE_URL=https://staging.apecam.xyz -e STREAM_ID=<live stream uuid> \
//          -e TOKEN=base/0x… tests/load/k6-view-token.js
// view-token is limited to 30/min per IP by design, so run it from many IPs (k6 cloud) or allow-list the
// runner in the staging environment. Every request mints a LiveKit JWT locally (no LiveKit API call).
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const ORIGIN = __ENV.ORIGIN || BASE;

export const options = {
  scenarios: {
    viewToken: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RPS || 50),
      timeUnit: '1s',
      duration: __ENV.DURATION || '3m',
      preAllocatedVUs: 50,
      maxVUs: 200,
      exec: 'viewToken',
    },
    token: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: __ENV.DURATION || '3m',
      preAllocatedVUs: 20,
      exec: 'token',
    },
  },
  thresholds: {
    'http_req_duration{name:view-token}': ['p(95)<300'],
    'http_req_duration{name:token}': ['p(95)<300'],
    http_req_failed: ['rate<0.005'],
  },
};

export function viewToken() {
  const res = http.post(`${BASE}/api/streams/${__ENV.STREAM_ID}/view-token`, null, {
    headers: { origin: ORIGIN },
    tags: { name: 'view-token' },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
}

export function token() {
  const res = http.get(`${BASE}/api/tokens/${__ENV.TOKEN}`, { tags: { name: 'token' } });
  check(res, { 'status 200': (r) => r.status === 200 });
}
