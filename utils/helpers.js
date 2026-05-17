import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// ── Custom metrics ────────────────────────────────────────────────────────────
export const cacheHitDuration  = new Trend('cache_hit_duration',  true);
export const cacheMissDuration = new Trend('cache_miss_duration', true);
export const cacheHits         = new Counter('cache_hits');
export const cacheMisses       = new Counter('cache_misses');
export const errorRate         = new Rate('error_rate');

/**
 * Build a URL with query params.
 * baseUrl('http://localhost:8080', '/catalog', { tenant_id: 'abc' })
 * → 'http://localhost:8080/catalog?tenant_id=abc'
 */
export function baseUrl(host, path, params = {}) {
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${host}${path}${q ? '?' + q : ''}`;
}

/**
 * Assert a response is OK and track error rate.
 */
export function assertOk(res, tag = '') {
  const ok = check(res, {
    [`${tag} status 200`]: r => r.status === 200,
    [`${tag} body not empty`]: r => r.body && r.body.length > 0,
  });
  errorRate.add(!ok);
  return ok;
}

/**
 * Detect whether the response was served from cache.
 * Works with common cache headers (X-Cache, CF-Cache-Status, or custom).
 */
export function isCacheHit(res) {
  const xCache = (res.headers['X-Cache'] || '').toLowerCase();
  const cfCache = (res.headers['Cf-Cache-Status'] || '').toLowerCase();
  const custom  = (res.headers['X-Cache-Status'] || '').toLowerCase();
  return xCache.includes('hit') || cfCache === 'hit' || custom === 'hit';
}

/**
 * Think time: random pause between min and max seconds (realistic user behaviour).
 */
export function think(minS = 0.5, maxS = 1.5) {
  sleep(minS + Math.random() * (maxS - minS));
}
