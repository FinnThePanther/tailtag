#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${1:-rtxbvjicfxgcouufumce}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/tailtag-remote-types.XXXXXX.ts")"

cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

cd "$ROOT_DIR"

supabase gen types typescript --project-id "$PROJECT_REF" --schema public > "$TMP_FILE"
python3 scripts/check-types.py "$TMP_FILE"
