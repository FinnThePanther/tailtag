#!/usr/bin/env bash
set -euo pipefail

PRINT_TARGET_IMAGE=false
SUPABASE_CLI_BIN="${SUPABASE_CLI_BIN:-}"
DEFAULT_TAG="${SUPABASE_TYPEGEN_PGMETA_TAG:-}"

if [[ "${1:-}" == "--print-target-image" ]]; then
  PRINT_TARGET_IMAGE=true
  shift
fi

if [[ "$#" -gt 0 ]]; then
  echo "Usage: $0 [--print-target-image]" >&2
  exit 1
fi

if [[ -z "$SUPABASE_CLI_BIN" ]]; then
  SUPABASE_CLI_BIN="$(command -v supabase || true)"
fi

if [[ -z "$SUPABASE_CLI_BIN" ]]; then
  echo "Supabase CLI not found on PATH." >&2
  exit 1
fi

if [[ -z "$DEFAULT_TAG" ]]; then
  DEFAULT_TAG="$(
    strings "$SUPABASE_CLI_BIN" \
      | sed -nE 's/.*pgmeta:"([0-9]+([.][0-9]+)*)".*/v\1/p' \
      | head -n 1
  )"
fi

if [[ -z "$DEFAULT_TAG" ]]; then
  echo "Unable to detect the Supabase CLI postgres-meta typegen image tag." >&2
  echo "Set SUPABASE_TYPEGEN_PGMETA_TAG, for example SUPABASE_TYPEGEN_PGMETA_TAG=v0.96.1." >&2
  exit 1
fi

if [[ "$DEFAULT_TAG" != v* ]]; then
  DEFAULT_TAG="v$DEFAULT_TAG"
fi

TARGET_IMAGE="public.ecr.aws/supabase/postgres-meta:$DEFAULT_TAG"
SOURCE_IMAGES=(
  "ghcr.io/supabase/postgres-meta:$DEFAULT_TAG"
  "supabase/postgres-meta:$DEFAULT_TAG"
  "$TARGET_IMAGE"
)

if [[ "$PRINT_TARGET_IMAGE" == "true" ]]; then
  echo "$TARGET_IMAGE"
  exit 0
fi

if docker image inspect "$TARGET_IMAGE" >/dev/null 2>&1; then
  echo "Supabase typegen image already available: $TARGET_IMAGE"
  exit 0
fi

pull_with_retries() {
  local image="$1"
  local attempt

  for attempt in 1 2 3; do
    echo "Pulling $image (attempt $attempt/3)..."
    if docker pull "$image"; then
      return 0
    fi

    if [[ "$attempt" != "3" ]]; then
      sleep $((attempt * 5))
    fi
  done

  return 1
}

for source_image in "${SOURCE_IMAGES[@]}"; do
  if pull_with_retries "$source_image"; then
    if [[ "$source_image" != "$TARGET_IMAGE" ]]; then
      docker tag "$source_image" "$TARGET_IMAGE"
    fi

    echo "Supabase typegen image ready: $TARGET_IMAGE"
    exit 0
  fi
done

echo "Unable to preload Supabase typegen image: $TARGET_IMAGE" >&2
exit 1
