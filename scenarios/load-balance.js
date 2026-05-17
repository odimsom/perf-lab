/**
 * load-balance.js
 *
 * Verifies that requests distribute across replicas and measures
 * per-instance latency variance.
 *
 * Works by reading a replica identifier from response headers.
 * Configure your service to inject one of:
 *   X-Replica-Id: <hostname or instance id>
 *   X-Instance:   <id>
 *   Server:       <id>
 *
 * If no such header is present, the test still runs but skips
 * distribution analysis.
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:8080 \
 *          -e TENANT_ID=your-uuid \
 *          -e REPLICA_HEADER=X-Replica-Id \
 *          scenarios/load-balance.js
 */

import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { baseUrl, assertOk, think } from '../utils/helpers.js';

const BASE_URL       = __ENV.BASE_URL       || 'http://localhost:8080';
const TENANT_ID      = __ENV.TENANT_ID      || '00000000-0000-0000-0000-000000000001';
const ENDPOINT       = __ENV.ENDPOINT       || '/catalog';
const REPLICA_HEADER = __ENV.REPLICA_HEADER || 'X-Replica-Id';

// Track per-replica hit counts via tagged counters
const replicaHits = new Counter('replica_hits');
const replicaLatency = new Trend('replica_latency', true);

// Shared state: track unique replicas seen (k6 doesn't support shared Map across VUs,
// so we use tagged metrics and analyse in handleSummary)
const seen = {};

export const options = {
  scenarios: {
    balanced: {
      executor: 'constant-vus',
      vus: 20,
      duration: '1m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed:   ['rate<0.01'],
  },
};

export default function () {
  const url = baseUrl(BASE_URL, ENDPOINT, { tenant_id: TENANT_ID });
  const res = http.get(url, { timeout: '10s' });

  assertOk(res, ENDPOINT);

  const replica = res.headers[REPLICA_HEADER]
    || res.headers[REPLICA_HEADER.toLowerCase()]
    || 'unknown';

  replicaHits.add(1, { replica });
  replicaLatency.add(res.timings.duration, { replica });

  think(0.1, 0.3);
}

export function handleSummary(data) {
  const m = data.metrics;

  // Extract per-replica hit counts from tagged metrics
  const replicaData = {};
  const hitsMetric = m['replica_hits'];
  if (hitsMetric?.values) {
    // k6 aggregates tagged metrics — collect all tag values
    Object.entries(hitsMetric.values).forEach(([key, val]) => {
      if (key.startsWith('count{replica:')) {
        const replica = key.match(/replica:([^}]+)/)?.[1] ?? 'unknown';
        replicaData[replica] = { hits: val };
      }
    });
  }

  const totalRequests = m['http_reqs']?.values?.count ?? 0;
  const uniqueReplicas = Object.keys(replicaData).length;

  // Calculate distribution balance (ideal = 100/n % per replica)
  if (uniqueReplicas > 0) {
    const ideal = totalRequests / uniqueReplicas;
    Object.keys(replicaData).forEach(r => {
      const hits = replicaData[r].hits;
      replicaData[r].share_pct = ((hits / totalRequests) * 100).toFixed(1);
      replicaData[r].deviation_pct = (((hits - ideal) / ideal) * 100).toFixed(1);
    });
  }

  const summary = {
    total_requests: totalRequests,
    unique_replicas: uniqueReplicas,
    p95_ms: m['http_req_duration']?.values?.['p(95)'] ?? 0,
    p99_ms: m['http_req_duration']?.values?.['p(99)'] ?? 0,
    error_rate: m['http_req_failed']?.values?.rate ?? 0,
    distribution: replicaData,
    note: uniqueReplicas <= 1
      ? `Only 1 replica detected. Add '${REPLICA_HEADER}' header to your service to see distribution.`
      : `Distribution across ${uniqueReplicas} replicas. Ideal share: ${(100/uniqueReplicas).toFixed(1)}% each.`,
  };

  console.log('\n── Load Balance Summary ─────────────────');
  console.log(JSON.stringify(summary, null, 2));

  return {
    'reports/load-balance.json': JSON.stringify({ ...data, summary }, null, 2),
  };
}
