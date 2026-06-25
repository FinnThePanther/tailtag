#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/tailtag-local-types.XXXXXX.ts")"
START_LOG="$(mktemp "${TMPDIR:-/tmp}/tailtag-supabase-start.XXXXXX.log")"
SUPABASE_PROJECT_ID="tailtag"

cleanup() {
  local status=$?
  rm -f "$TMP_FILE" "$START_LOG"
  supabase stop --project-id "$SUPABASE_PROJECT_ID" --no-backup >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

cd "$ROOT_DIR"

scripts/preload-supabase-typegen-image.sh

echo "Starting local Supabase stack..."
if ! supabase start > "$START_LOG" 2>&1; then
  echo "supabase start failed. Redacted startup output:"
  sed -E \
    -e 's/^([[:space:]]*(anon key|service_role key|jwt secret|s3 access key|s3 secret key):).*/\1 [suppressed]/I' \
    -e 's/(Bearer|apikey=|apikey:)[[:space:]]+[A-Za-z0-9._-]+/\1 [suppressed]/Ig' \
    "$START_LOG"
  exit 1
fi

supabase db reset
supabase gen types typescript --local --schema public > "$TMP_FILE"
PYTHONDONTWRITEBYTECODE=1 python3 scripts/check-types.py "$TMP_FILE"
