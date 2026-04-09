#!/usr/bin/env bash
# scripts/verify-environment.sh
#
# Verifies a TailTag Supabase environment against required configuration.
# Checks realtime tables, cron jobs, vault secrets, and storage buckets.
#
# Usage:
#   ./scripts/verify-environment.sh development
#   ./scripts/verify-environment.sh staging
#   ./scripts/verify-environment.sh production
#
# Requires:
#   - Supabase CLI authenticated via `npx supabase login`
#   - Run from the repository root

set -euo pipefail

# ── Argument handling ────────────────────────────────────────────────────────

ENV="${1:-}"

if [[ -z "$ENV" ]]; then
  echo "Usage: $0 <development|staging|production>"
  exit 1
fi

case "$ENV" in
  development) PROJECT_REF="rtxbvjicfxgcouufumce" ;;
  staging)     PROJECT_REF="yjsadmswobafychfpoxe" ;;
  production)  PROJECT_REF="dowtlhkzbxxmiflpswvd" ;;
  *)
    echo "Error: unknown environment '$ENV'. Must be development, staging, or production."
    exit 1
    ;;
esac

# ── Setup ────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

FAILURES=0
WARNINGS=0

# ── Helpers ──────────────────────────────────────────────────────────────────

section() { echo ""; echo "── $* ──────────────────────────────────────────"; }
pass()    { echo "  ✓ $*"; }
fail()    { echo "  ✗ $*"; FAILURES=$((FAILURES + 1)); }
warn()    { echo "  ⚠ $*"; WARNINGS=$((WARNINGS + 1)); }

# Use the globally installed supabase CLI in CI; fall back to npx locally.
if command -v supabase >/dev/null 2>&1; then
  SUPABASE_CLI="supabase"
else
  SUPABASE_CLI="npx supabase"
fi

# Run a SQL query and return the first data value (strips CSV header).
sql() {
  $SUPABASE_CLI db query --linked --output csv "$1" 2>/dev/null \
    | tail -n +2 \
    | head -1 \
    | tr -d '[:space:]'
}

# Check that a SQL count query returns "1" (row present / active).
check() {
  local label="$1"
  local query="$2"
  local result
  result=$(sql "$query")
  if [[ "$result" == "1" ]]; then
    pass "$label"
  else
    fail "$label"
  fi
}

# ── Link ─────────────────────────────────────────────────────────────────────

echo ""
echo "Verifying environment: $ENV ($PROJECT_REF)"
$SUPABASE_CLI link --project-ref "$PROJECT_REF" 2>/dev/null
echo ""

# ── 1. Realtime ──────────────────────────────────────────────────────────────

section "Realtime publication (supabase_realtime)"

REALTIME_TABLES=(
  catches
  daily_assignments
  notifications
  user_achievements
  user_daily_progress
  user_daily_streaks
)

for table in "${REALTIME_TABLES[@]}"; do
  check "$table" \
    "SELECT count(*)::text FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='$table'"
done

# ── 2. Cron jobs ─────────────────────────────────────────────────────────────

section "Cron jobs (active)"

CRON_JOBS=(
  "expire-pending-catches"
  "gameplay-queue-worker"
  "purge_geo_verification_data"
  "refresh-mv-achievement-unlocks-daily"
  "refresh-mv-catches-hourly"
  "refresh-mv-convention-daily-stats"
  "rotate-dailys-refresh"
)

for job in "${CRON_JOBS[@]}"; do
  check "$job" \
    "SELECT count(*)::text FROM cron.job WHERE jobname='$job' AND active=true"
done

# ── 3. Queue infrastructure ──────────────────────────────────────────────────

section "Queue infrastructure"

check "gameplay_event_processing queue" \
  "SELECT count(*)::text FROM pgmq.list_queues() WHERE queue_name='gameplay_event_processing'"

check "app_private.ingest_gameplay_event" \
  "SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='app_private' AND p.proname='ingest_gameplay_event'"

check "app_private.edge_function_config_value" \
  "SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='app_private' AND p.proname='edge_function_config_value'"

# ── 4. Vault secrets ─────────────────────────────────────────────────────────

section "Vault secrets"

SECRETS=(
  "achievements_processor_secret"
  "ACHIEVEMENTS_PROCESSOR_URL"
  "ACHIEVEMENTS_WEBHOOK_SECRET"
  "project_url"
  "rotate_dailys_service_role_key"
  "send_push_service_role_jwt"
  "SERVICE_ROLE_KEY"
  "SUPABASE_URL"
)

for secret in "${SECRETS[@]}"; do
  check "$secret" \
    "SELECT count(*)::text FROM vault.secrets WHERE name='$secret'"
done

# ── 5. Storage buckets ───────────────────────────────────────────────────────

section "Storage buckets"

BUCKETS=(
  "catch-photos"
  "fursuit-avatars"
  "profile-avatars"
)

for bucket in "${BUCKETS[@]}"; do
  check "$bucket" \
    "SELECT count(*)::text FROM storage.buckets WHERE name='$bucket'"
done

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Environment: $ENV"
if [[ $FAILURES -eq 0 && $WARNINGS -eq 0 ]]; then
  echo "  Result:      ALL CHECKS PASSED"
elif [[ $FAILURES -eq 0 ]]; then
  echo "  Result:      PASSED with $WARNINGS warning(s)"
else
  echo "  Result:      $FAILURES FAILURE(S)  $WARNINGS warning(s)"
fi
echo "════════════════════════════════════════════════════════════"
echo ""

if [[ $FAILURES -gt 0 ]]; then
  exit 1
fi
