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

# ── 2. Reference seed data ───────────────────────────────────────────────────

step "Applying reference seed data (supabase/seeds/reference.sql)"
npx supabase db query --linked -f supabase/seeds/reference.sql
ok "Reference seed applied."

# ── 3. Staging fixtures (dev/staging only) ───────────────────────────────────

if [[ "$ENV" == "development" || "$ENV" == "staging" ]]; then
  FIXTURES="supabase/seeds/staging-fixtures.sql"
  if [[ -f "$FIXTURES" ]]; then
    step "Applying staging fixture accounts ($FIXTURES)"
    npx supabase db query --linked -f "$FIXTURES"
    ok "Staging fixtures applied."
  else
    warn "No staging-fixtures.sql found — skipping."
  fi
fi

# ── 4. Edge functions ────────────────────────────────────────────────────────

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
  npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
  DEPLOYED=$((DEPLOYED + 1))
done
ok "$DEPLOYED edge functions deployed."
if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  warn "Skipped (no index.ts): ${SKIPPED[*]}"
fi

# ── 5. Manual checklist ──────────────────────────────────────────────────────

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

echo "  Fixture accounts (dev/staging only):"
if [[ "$ENV" != "production" ]]; then
  echo "    [ ] Verify fixture accounts are in the password manager"
  echo "        (player, fursuit-owner, staff, admin)"
fi
echo ""
