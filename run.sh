#!/usr/bin/env bash
# ── perf-lab runner ───────────────────────────────────────────────────────────
# Usage:
#   ./run.sh smoke          BASE_URL=http://localhost:8080 TENANT_ID=uuid
#   ./run.sh lazy-loading   BASE_URL=http://localhost:8080 TENANT_ID=uuid
#   ./run.sh concurrency    BASE_URL=http://localhost:8080 TENANT_ID=uuid
#   ./run.sh load-balance   BASE_URL=http://localhost:8080 TENANT_ID=uuid
#   ./run.sh all            (runs all scenarios sequentially)
#
# With live Grafana dashboard:
#   ./run.sh concurrency --dashboard
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCENARIO="${1:-smoke}"
DASHBOARD=false
shift || true
while [[ $# -gt 0 ]]; do
  [[ "$1" == "--dashboard" ]] && DASHBOARD=true
  shift
done

export BASE_URL="${BASE_URL:-http://localhost:8080}"
export TENANT_ID="${TENANT_ID:-00000000-0000-0000-0000-000000000001}"
export ENDPOINT="${ENDPOINT:-/catalog}"
export REPLICA_HEADER="${REPLICA_HEADER:-X-Replica-Id}"

mkdir -p reports

run_scenario() {
  local sc="$1"
  echo ""
  echo "══════════════════════════════════════════════"
  echo "  Running: ${sc}"
  echo "  Target:  ${BASE_URL}${ENDPOINT}"
  echo "══════════════════════════════════════════════"

  if $DASHBOARD; then
    export SCENARIO="${sc}.js"
    docker compose up --abort-on-container-exit k6
  else
    k6 run \
      -e BASE_URL="$BASE_URL" \
      -e TENANT_ID="$TENANT_ID" \
      -e ENDPOINT="$ENDPOINT" \
      -e REPLICA_HEADER="$REPLICA_HEADER" \
      "scenarios/${sc}.js"
  fi
}

if [[ "$SCENARIO" == "all" ]]; then
  run_scenario smoke
  run_scenario lazy-loading
  run_scenario concurrency
  run_scenario load-balance
else
  run_scenario "$SCENARIO"
fi

echo ""
echo "Reports saved to: $(pwd)/reports/"
