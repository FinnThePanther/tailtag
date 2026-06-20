#!/usr/bin/env python3
"""
Replaces the generated portion of src/types/database.ts with fresh output
from the Supabase CLI, preserving the manually maintained type aliases.

Usage:
  python3 scripts/update-types.py <generated-types-file>
"""
import sys

from type_utils import manual_aliases, normalize_generated_types

if len(sys.argv) != 2:
    print("Usage: update-types.py <generated-types-file>")
    sys.exit(1)

try:
    generated = open(sys.argv[1]).read()
    committed = open("src/types/database.ts").read()
    aliases = manual_aliases(committed)
    new_generated = normalize_generated_types(generated)
except RuntimeError as error:
    print(f"ERROR: {error}")
    sys.exit(1)

new_content = new_generated + "\n\n" + aliases + "\n" if aliases else new_generated + "\n"

with open("src/types/database.ts", "w") as f:
    f.write(new_content)

print("src/types/database.ts updated.")
