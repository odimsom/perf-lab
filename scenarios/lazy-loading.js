/**
 * lazy-loading.js
 *
 * Validates the lazy cache pattern:
 *   Cold request  → hits DB   → slow  → populates cache
 *   Warm requests → hits Redis → fast  → served from cache
 *
 * Measures:
 *   - cache_miss_duration  (cold path)
 *   - cache_hit_duration   (warm path)
 *   - speedup ratio between cold and warm
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:8080 \
 *          -e TENANT_ID=your-uuid \
 *          scenarios/lazy-loading.js
 */

import http from 'k6/http';
import { sleep, check } from 'k6';
import {
  cacheHitDuration, cacheMissDuration,
  cacheHits, cacheMisses,
  baseUrl, assertOk, isCacheHit,
} from '../utils/helpers.js';

const BASE_URL  = __ENV.BASE_URL  || 'http://localhost:8080';
const TENANT_ID = __ENV.TENANT_ID || '00000000-0000-0000-0000-000000000001';
const ENDPOINT  = __ENV.ENDPOINT  || '/catalog';

export const options = {
  scenarios: {
    // Phase 1: single cold request per VU (cache miss)
    cold: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '30s',
      tags: { phase: 'cold' },
    },
    // Phase 2: warm requests after cache is populated
    warm: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      startTime: '5s',   // give cold phase time to populate cache
      tags: { phase: 'warm' },
    },
  },
  thresholds: {
    // Warm (cached) requests must be under 150ms at p95
    'cache_hit_duration{phase:warm}': ['p(95)<150'],
    // Cold (DB) requests allowed up to 2s
    'cache_miss_duration{phase:cold}': ['p(95)<2000'],
    'error_rate': ['rate<0.01'],
  },
};

export default function () {
  const url = baseUrl(BASE_URL, ENDPOINT, { tenant_id: TENANT_ID });
  const res = http.get(url, {
    tags: { endpoint: ENDPOINT },
    timeout: '10s',
  });

  assertOk(res, ENDPOINT);

  const hit = isCacheHit(res);

  if (hit) {
    cacheHitDuration.add(res.timings.duration);
    cacheHits.add(1);
  } else {
    cacheMissDuration.add(res.timings.duration);
    cacheMisses.add(1);
  }

  // Log timing on each iteration for manual inspection
  console.log(
    `[${hit ? 'HIT ' : 'MISS'}] ${res.status} ${res.timings.duration.toFixed(1)}ms`
  );

  sleep(0.2);
}

export function handleSummary(data) {
  const coldP95 = data.metrics['cache_miss_duration']?.values?.['p(95)'] ?? 'N/A';
  const warmP95 = data.metrics['cache_hit_duration']?.values?.['p(95)'] ?? 'N/A';
  const speedup = (typeof coldP95 === 'number' && typeof warmP95 === 'number')
    ? (coldP95 / warmP95).toFixed(1) + 'x'
    : 'N/A';

  const summary = {
    cold_p95_ms: coldP95,
    warm_p95_ms: warmP95,
    speedup,
    hits:  data.metrics['cache_hits']?.values?.count  ?? 0,
    misses: data.metrics['cache_misses']?.values?.count ?? 0,
    errors: data.metrics['error_rate']?.values?.rate ?? 0,
  };

  console.log('\n── Lazy Loading Summary ─────────────────');
  console.log(JSON.stringify(summary, null, 2));

  return {
    'reports/lazy-loading.json': JSON.stringify({ ...data, summary }, null, 2),
  };
}
