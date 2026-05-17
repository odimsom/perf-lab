/**
 * concurrency.js
 *
 * Stress-tests an endpoint with ramping virtual users to find:
 *   - Maximum throughput (req/s) before latency degrades
 *   - p95/p99 response times under sustained load
 *   - Error rate at peak concurrency
 *
 * Stages:
 *   0 → 50 VUs  in 30s  (ramp up)
 *   50 VUs      for 1m  (sustained peak)
 *   50 → 100 VUs in 30s (stress spike)
 *   100 VUs     for 30s (peak stress)
 *   100 → 0 VUs in 15s  (ramp down)
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:8080 \
 *          -e TENANT_ID=your-uuid \
 *          -e ENDPOINT=/catalog \
 *          scenarios/concurrency.js
 */

import http from 'k6/http';
import { sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { baseUrl, assertOk, think } from '../utils/helpers.js';

const BASE_URL  = __ENV.BASE_URL  || 'http://localhost:8080';
const TENANT_ID = __ENV.TENANT_ID || '00000000-0000-0000-0000-000000000001';
const ENDPOINT  = __ENV.ENDPOINT  || '/catalog';

const responseTime = new Trend('response_time', true);
const throughput   = new Counter('requests_total');
const errorRate    = new Rate('error_rate');

export const options = {
  stages: [
    { duration: '30s', target: 50  },  // ramp up to 50 VUs
    { duration: '1m',  target: 50  },  // hold — steady state
    { duration: '30s', target: 100 },  // spike to 100 VUs
    { duration: '30s', target: 100 },  // hold at peak
    { duration: '15s', target: 0   },  // ramp down
  ],
  thresholds: {
    http_req_duration:    ['p(95)<500', 'p(99)<1000'],
    http_req_failed:      ['rate<0.02'],
    error_rate:           ['rate<0.02'],
    response_time:        ['p(95)<500'],
  },
};

export default function () {
  const url = baseUrl(BASE_URL, ENDPOINT, { tenant_id: TENANT_ID });

  const res = http.get(url, { timeout: '10s' });

  responseTime.add(res.timings.duration);
  throughput.add(1);
  assertOk(res, ENDPOINT);

  think(0.1, 0.3);
}

export function handleSummary(data) {
  const m = data.metrics;
  const summary = {
    total_requests:   m['requests_total']?.values?.count        ?? 0,
    req_per_sec:      m['http_reqs']?.values?.rate              ?? 0,
    p50_ms:           m['http_req_duration']?.values?.['p(50)'] ?? 0,
    p95_ms:           m['http_req_duration']?.values?.['p(95)'] ?? 0,
    p99_ms:           m['http_req_duration']?.values?.['p(99)'] ?? 0,
    max_ms:           m['http_req_duration']?.values?.max       ?? 0,
    error_rate:       m['error_rate']?.values?.rate             ?? 0,
  };

  console.log('\n── Concurrency Summary ──────────────────');
  console.log(JSON.stringify(summary, null, 2));

  return {
    'reports/concurrency.json': JSON.stringify({ ...data, summary }, null, 2),
  };
}
