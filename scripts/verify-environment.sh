#!/usr/bin/env bash
# scripts/verify-environment.sh
#
# Verifies a TailTag Supabase environment against required configuration.
# Checks realtime tables, cron jobs, vault secrets, storage buckets, and backend
# event-processing canaries.
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

# Run a SQL query and return the first data value.
sql() {
  local raw
  raw="$($SUPABASE_CLI db query --linked --output json "$1" 2>/dev/null)"
  RAW_SQL_RESULT="$raw" python3 - <<'PY'
import json
import os

raw = os.environ.get("RAW_SQL_RESULT", "")
start = raw.find("{")
end = raw.rfind("}")
if start == -1 or end == -1:
    print("")
    raise SystemExit

parsed = json.loads(raw[start : end + 1])
if isinstance(parsed, list):
    rows = parsed
elif isinstance(parsed, dict):
    rows = parsed.get("rows") or parsed.get("data") or []
    if not rows and parsed:
        rows = [parsed]
else:
    rows = []
if not rows:
    print("")
    raise SystemExit

row = rows[0]
if not row:
    print("")
    raise SystemExit

value = next(iter(row.values()))
print("" if value is None else str(value).strip())
PY
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

# Skip linking if already linked to the correct project (e.g. when called
# from a CI job that already ran `supabase link`).
LINKED_REF=""
if [[ -f supabase/.temp/linked-project.json ]]; then
  LINKED_REF=$(python3 -c "import json; print(json.load(open('supabase/.temp/linked-project.json')).get('ref',''))" 2>/dev/null || true)
fi
if [[ "$LINKED_REF" == "$PROJECT_REF" ]]; then
  echo "Already linked to $PROJECT_REF — skipping link step."
else
  $SUPABASE_CLI link --project-ref "$PROJECT_REF" 2>/dev/null
fi
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
  "convention-lifecycle-automation"
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

section "Convention lifecycle automation"

check "app_private.invoke_convention_closeout is async" \
  "SELECT CASE WHEN pg_get_functiondef('app_private.invoke_convention_closeout(text,jsonb,uuid,text,text)'::regprocedure) NOT ILIKE '%http_collect_response%' THEN 1 ELSE 0 END::text"

# ── 4. Vault secrets ─────────────────────────────────────────────────────────

section "Vault secrets"

SECRETS=(
  "achievements_processor_secret"
  "ACHIEVEMENTS_PROCESSOR_URL"
  "ACHIEVEMENTS_WEBHOOK_SECRET"
  "closeout_service_role_key"
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

check "ACHIEVEMENTS_PROCESSOR_URL targets process-gameplay-queue" \
  "WITH project_url AS (
     SELECT decrypted_secret
       FROM vault.decrypted_secrets
      WHERE name='SUPABASE_URL'
      ORDER BY created_at DESC
      LIMIT 1
   ),
   processor_url AS (
     SELECT decrypted_secret
       FROM vault.decrypted_secrets
      WHERE name='ACHIEVEMENTS_PROCESSOR_URL'
      ORDER BY created_at DESC
      LIMIT 1
   )
   SELECT CASE
     WHEN (SELECT decrypted_secret FROM processor_url) =
       rtrim((SELECT decrypted_secret FROM project_url), '/') || '/functions/v1/process-gameplay-queue'
     THEN 1 ELSE 0
   END::text"

section "Edge Function secrets"

EDGE_SECRETS_JSON="$($SUPABASE_CLI secrets list --project-ref "$PROJECT_REF" --output json 2>/dev/null || true)"

edge_secret_count() {
  local secret_name="$1"
  EDGE_SECRETS_JSON="$EDGE_SECRETS_JSON" SECRET_NAME="$secret_name" python3 - <<'PY'
import json
import os

raw = os.environ.get("EDGE_SECRETS_JSON", "")
secret_name = os.environ.get("SECRET_NAME", "")
try:
    parsed = json.loads(raw)
except Exception:
    print("0")
    raise SystemExit

if isinstance(parsed, dict):
    if isinstance(parsed.get("secrets"), list):
        items = parsed["secrets"]
    else:
        items = list(parsed.values())
else:
    items = parsed
count = 0
for item in items if isinstance(items, list) else []:
    if not isinstance(item, dict):
        continue
    name = item.get("name") or item.get("Name")
    if name == secret_name:
        count += 1
print(count)
PY
}

check_edge_secret() {
  local label="$1"
  local secret_name="$2"
  local result
  result=$(edge_secret_count "$secret_name")
  if [[ "$result" == "1" ]]; then
    pass "$label"
  else
    fail "$label"
  fi
}

check_edge_secret_any() {
  local label="$1"
  shift
  local total=0
  local secret
  for secret in "$@"; do
    total=$((total + $(edge_secret_count "$secret")))
  done
  if [[ "$total" -gt 0 ]]; then
    pass "$label"
  else
    fail "$label"
  fi
}

check_edge_secret "SERVICE_ROLE_KEY" "SERVICE_ROLE_KEY"
check_edge_secret_any \
  "LIFECYCLE_AUTOMATION_ACTOR_ID or SYSTEM_EVENT_USER_ID" \
  "LIFECYCLE_AUTOMATION_ACTOR_ID" \
  "SYSTEM_EVENT_USER_ID"

section "Backend event-processing canary"

if SUPABASE_CLI="$SUPABASE_CLI" python3 -S scripts/run-event-processing-canary.py \
  --environment "$ENV" \
  --project-ref "$PROJECT_REF"; then
  pass "events-ingress -> gameplay queue -> worker success"
else
  fail "events-ingress -> gameplay queue -> worker success"
fi

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
