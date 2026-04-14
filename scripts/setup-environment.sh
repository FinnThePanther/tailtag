#!/usr/bin/env bash
# scripts/setup-environment.sh
#
# Bootstraps a TailTag Supabase environment from committed assets.
# Applies migrations, seeds reference data, and deploys all edge functions.
#
# Usage:
#   ./scripts/setup-environment.sh development
#   ./scripts/setup-environment.sh staging
#   ./scripts/setup-environment.sh production
#
# Requires:
#   - Supabase CLI (npx supabase): authenticated via `npx supabase login`
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

# ── Guards ───────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -f "supabase/config.toml" ]]; then
  echo "Error: must be run from the repository root (supabase/config.toml not found)."
  exit 1
fi

# Confirm before touching production
if [[ "$ENV" == "production" ]]; then
  echo ""
  echo "  ┌──────────────────────────────────────────────────┐"
  echo "  │  WARNING: you are about to modify PRODUCTION.    │"
  echo "  │  Migrations and seed data will be applied.       │"
  echo "  └──────────────────────────────────────────────────┘"
  echo ""
  read -r -p "  Type 'production' to confirm: " CONFIRM
  if [[ "$CONFIRM" != "production" ]]; then
    echo "Aborted."
    exit 1
  fi
  echo ""
fi

# ── Helpers ──────────────────────────────────────────────────────────────────

step() { echo ""; echo "▶ $*"; }
ok()   { echo "  ✓ $*"; }
warn() { echo "  ⚠ $*"; }

# ── 0. Link to target project ────────────────────────────────────────────────
# db push and db query use --linked (the currently linked project).
# Link now so subsequent commands target the right environment.

step "Linking to $ENV ($PROJECT_REF)"
npx supabase link --project-ref "$PROJECT_REF"
ok "Linked."

# ── 1. Migrations ────────────────────────────────────────────────────────────

step "Applying migrations → $ENV"
npx supabase db push --linked
ok "Migrations applied."

step "Ensuring gameplay event queue exists"
npx supabase db query --linked "
DO \$\$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pgmq.list_queues()
    WHERE queue_name = 'gameplay_event_processing'
  ) THEN
    PERFORM pgmq.create('gameplay_event_processing');
  END IF;
END
\$\$;
"
ok "Gameplay event queue ready."

# ── 1b. Vault + edge function secrets ────────────────────────────────────────
# After a DB reset/resync the vault's SERVICE_ROLE_KEY may contain a stale key
# copied from another project. The cron-triggered queue worker
# (process_gameplay_queue_if_active) reads SERVICE_ROLE_KEY and SUPABASE_URL from
# vault to call Edge Functions, so stale or missing values cause silent 401s or
# skipped processing.

step "Syncing required vault secrets and edge function secrets"

# Fetch this project's actual service role key from the Supabase API.
SERVICE_ROLE_KEY=$(npx supabase projects api-keys --project-ref "$PROJECT_REF" 2>/dev/null \
  | awk -F'|' '/service_role/ {gsub(/ /, "", $2); print $2}')
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

if [[ -z "$SERVICE_ROLE_KEY" ]]; then
  warn "Could not fetch service role key — skipping vault update."
  warn "Run manually after this script:"
  warn "  supabase db query --linked \"SELECT vault.update_secret(id, '<service_role_key>') FROM vault.secrets WHERE name = 'SERVICE_ROLE_KEY';\""
  warn "  supabase secrets set SERVICE_ROLE_KEY='<service_role_key>' --project-ref $PROJECT_REF"
else
  # Upsert into vault (update if exists, create if missing).
  npx supabase db query --linked "
  DO \$\$
  DECLARE
    v_id uuid;
    v_service_role_key text := '$SERVICE_ROLE_KEY';
    v_supabase_url text := '$SUPABASE_URL';
  BEGIN
    SELECT id INTO v_id FROM vault.secrets WHERE name = 'SERVICE_ROLE_KEY' LIMIT 1;
    IF v_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_id, v_service_role_key);
    ELSE
      PERFORM vault.create_secret(v_service_role_key, 'SERVICE_ROLE_KEY', 'Service role key for edge function auth');
    END IF;

    SELECT id INTO v_id FROM vault.secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    IF v_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_id, v_supabase_url);
    ELSE
      PERFORM vault.create_secret(v_supabase_url, 'SUPABASE_URL', 'Project URL for internal edge function calls');
    END IF;
  END;
  \$\$;
  " > /dev/null
  # Also set as edge function secrets so functions that read these values
  # directly get the right project-specific values.
  npx supabase secrets set SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" --project-ref "$PROJECT_REF" > /dev/null
  npx supabase secrets set SUPABASE_URL="$SUPABASE_URL" --project-ref "$PROJECT_REF" > /dev/null
  ok "Vault and edge function required secrets updated."
fi

# ── 1c. Derived vault secrets ────────────────────────────────────────────────
# Idempotently seed the remaining application vault secrets
# (rotate_dailys_service_role_key, project_url, etc.) from values already in
# the vault. Runs entirely server-side so no secret values cross this boundary.

step "Bootstrapping derived vault secrets"
npx supabase db query --linked -f scripts/bootstrap-vault-secrets.sql > /dev/null
ok "Derived vault secrets bootstrapped."

# ── 2. Reference seed data ───────────────────────────────────────────────────

step "Applying reference seed data (supabase/seeds/reference.sql)"
npx supabase db query --linked -f supabase/seeds/reference.sql
ok "Reference seed applied."

# ── 3. Edge functions ─────────────────────────────────────────────────────────

# All deployable functions (directories directly under supabase/functions/, excluding _shared)
FUNCTIONS=()
while IFS= read -r -d '' dir; do
  name="$(basename "$dir")"
  if [[ "$name" != _* ]]; then
    FUNCTIONS+=("$name")
  fi
done < <(find supabase/functions -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)

step "Deploying ${#FUNCTIONS[@]} edge functions → $ENV"
DEPLOYED=0
SKIPPED=()
for fn in "${FUNCTIONS[@]}"; do
  if [[ ! -f "supabase/functions/$fn/index.ts" ]]; then
    SKIPPED+=("$fn")
    continue
  fi
  echo "  Deploying: $fn"
  if [[ "$fn" == "create-catch" || "$fn" == "delete-account" || "$fn" == "events-ingress" ]]; then
    npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt
  else
    npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
  fi
  DEPLOYED=$((DEPLOYED + 1))
done
ok "$DEPLOYED edge functions deployed."
if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  warn "Skipped (no index.ts): ${SKIPPED[*]}"
fi

# ── 4. Manual checklist ──────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Bootstrap complete for: $ENV"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  The following steps require manual verification in the"
echo "  Supabase dashboard (https://supabase.com/dashboard):"
echo ""
echo "  Storage buckets (create if missing):"
echo "    [ ] fursuit-avatars    — public: no,  RLS: yes"
echo "    [ ] profile-avatars    — public: no,  RLS: yes"
echo "    [ ] catch-photos       — public: no,  RLS: yes"
echo ""
echo "  Realtime (enable replication for required tables):"
echo "    [ ] notifications"
echo "    [ ] catches"
echo "    [ ] pending_catches"
echo "    [ ] user_achievements"
echo ""
echo "  Secrets (Edge Functions → Secrets in dashboard):"
echo "    [ ] EXPO_PUSH_ACCESS_TOKEN"
echo "    [ ] SENTRY_DSN              (if applicable)"
echo ""
echo "  Scheduler jobs (Database → Cron in dashboard):"
echo "    [ ] rotate-dailys          — daily per convention timezone"
echo "    [ ] expire-pending-catches — periodic cleanup"
echo "    [ ] expire-bans            — periodic cleanup"
echo ""

if [[ "$ENV" == "production" ]]; then
  echo "  Production-only:"
  echo "    [ ] PITR (Point-in-Time Recovery) enabled — requires Pro plan"
  echo "    [ ] pg_cron extension enabled"
  echo ""
fi

echo ""
