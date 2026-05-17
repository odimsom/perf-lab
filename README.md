# perf-lab

Generic performance testing suite for HTTP APIs — lazy loading, concurrency, load balancing, response speed.

Built on [k6](https://k6.io) with an optional Grafana live dashboard.

## Scenarios

| Scenario | What it tests |
|---|---|
| `smoke` | Sanity check — 1 VU, confirms the target is alive |
| `lazy-loading` | Cold (DB) vs warm (cache) latency — measures cache speedup |
| `concurrency` | Ramps to 100 VUs, measures p95/p99 under sustained load |
| `load-balance` | Verifies requests distribute across replicas (requires `X-Replica-Id` header) |

## Requirements

- [k6](https://k6.io/docs/get-started/installation/) installed locally, **or**
- Docker + Docker Compose (for Grafana dashboard mode)

## Quick start

```bash
# Smoke test (requires k6 installed)
BASE_URL=http://localhost:8080 TENANT_ID=your-uuid ./run.sh smoke

# Lazy loading test
BASE_URL=http://localhost:8080 TENANT_ID=your-uuid ./run.sh lazy-loading

# Concurrency ramp (50→100 VUs)
BASE_URL=http://localhost:8080 TENANT_ID=your-uuid ENDPOINT=/catalog ./run.sh concurrency

# Load balancing (needs X-Replica-Id header in your service)
BASE_URL=http://localhost:8080 ./run.sh load-balance

# Run all scenarios sequentially
BASE_URL=http://localhost:8080 TENANT_ID=your-uuid ./run.sh all
```

## With live Grafana dashboard

Starts InfluxDB + Grafana, streams k6 metrics in real time:

```bash
# Start dashboard stack first
docker compose up -d influxdb grafana

# Run a scenario with metrics streaming
BASE_URL=http://localhost:8080 TENANT_ID=your-uuid ./run.sh concurrency --dashboard

# Open dashboard
open http://localhost:3001
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:8080` | Target service base URL |
| `TENANT_ID` | `00000000-...` | Tenant UUID to pass as query param |
| `ENDPOINT` | `/catalog` | API path to test |
| `REPLICA_HEADER` | `X-Replica-Id` | Response header identifying the replica |

## Reports

JSON summaries are saved to `reports/` after each run (gitignored):

```
reports/
  smoke.json
  lazy-loading.json
  concurrency.json
  load-balance.json
```

## Adding your own scenario

Copy any file in `scenarios/` as a template. The `utils/helpers.js` provides:

- `baseUrl(host, path, params)` — build URLs with query params
- `assertOk(res, tag)` — check status 200 + track error rate
- `isCacheHit(res)` — detect cache hits from common headers
- `think(minS, maxS)` — realistic random pause between requests
- Custom metrics: `cacheHitDuration`, `cacheMissDuration`, `cacheHits`, `cacheMisses`, `errorRate`
