#!/usr/bin/env python3
"""
Replaces the generated portion of src/types/database.ts with fresh output
from the Supabase CLI, preserving the manually maintained type aliases.

Usage:
  python3 scripts/update-types.py <generated-types-file>
"""
import sys

if len(sys.argv) != 2:
    print("Usage: update-types.py <generated-types-file>")
    sys.exit(1)

generated = open(sys.argv[1]).read().rstrip()

committed = open("src/types/database.ts").read()
boundary = "// Type aliases for application use"
idx = committed.find(boundary)
aliases = committed[idx:].rstrip() if idx != -1 else ""

new_content = generated + "\n\n" + aliases + "\n" if aliases else generated + "\n"

with open("src/types/database.ts", "w") as f:
    f.write(new_content)

print("src/types/database.ts updated.")
