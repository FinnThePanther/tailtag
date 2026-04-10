#!/bin/sh
# Installs git hooks from scripts/hooks/ into .git/hooks/.
# Runs automatically via `npm prepare` after `npm install`.

HOOKS_DIR="$(git rev-parse --git-dir)/hooks"

for hook in scripts/hooks/*; do
  name="$(basename "$hook")"
  dest="$HOOKS_DIR/$name"
  cp "$hook" "$dest"
  chmod +x "$dest"
  echo "Installed git hook: $name"
done
