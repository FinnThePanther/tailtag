#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/tailtag-local-types.XXXXXX.ts")"
SUPABASE_PROJECT_ID="tailtag"

cleanup() {
  local status=$?
  rm -f "$TMP_FILE"
  supabase stop --project-id "$SUPABASE_PROJECT_ID" --no-backup >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

cd "$ROOT_DIR"

supabase start
supabase db reset
supabase gen types typescript --local --schema public > "$TMP_FILE"
python3 scripts/check-types.py "$TMP_FILE"
