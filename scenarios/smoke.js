/**
 * smoke.js
 *
 * Minimal sanity check — 1 VU, 10 iterations.
 * Run this first to confirm the target is reachable and returning valid responses
 * before committing to a full load test.
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:8080 \
 *          -e TENANT_ID=your-uuid \
 *          scenarios/smoke.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { baseUrl } from '../utils/helpers.js';

const BASE_URL  = __ENV.BASE_URL  || 'http://localhost:8080';
const TENANT_ID = __ENV.TENANT_ID || '00000000-0000-0000-0000-000000000001';

const ENDPOINTS = [
  { path: '/health',  params: {} },
  { path: __ENV.ENDPOINT || '/catalog', params: { tenant_id: TENANT_ID } },
];

export const options = {
  vus: 1,
  iterations: 10,
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed:   ['rate<0.01'],
  },
};

export default function () {
  for (const ep of ENDPOINTS) {
    const url = baseUrl(BASE_URL, ep.path, ep.params);
    const res = http.get(url, { timeout: '15s' });

    check(res, {
      [`${ep.path} → 200`]: r => r.status === 200,
      [`${ep.path} → body`]: r => r.body?.length > 0,
      [`${ep.path} → <2s`]:  r => r.timings.duration < 2000,
    });

    console.log(`${ep.path}  ${res.status}  ${res.timings.duration.toFixed(0)}ms`);
    sleep(0.5);
  }
}
