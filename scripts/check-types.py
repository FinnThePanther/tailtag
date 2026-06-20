#!/usr/bin/env python3
"""
Compares generated Supabase types against the committed src/types/database.ts.

The committed file has manually maintained type aliases appended after the
generated section, delimited by "// Type aliases for application use".
Only the generated portion is compared.

Usage:
  python3 scripts/check-types.py <generated-types-file>
"""
import sys

from type_utils import (
    generated_section,
    normalize_generated_types,
    normalize_supabase_helper_spacing,
    strip_supabase_internal_metadata,
)

if len(sys.argv) != 2:
    print("Usage: check-types.py <generated-types-file>")
    sys.exit(1)

try:
    committed = open("src/types/database.ts").read()
    generated = open(sys.argv[1]).read()
    committed_gen = strip_supabase_internal_metadata(
        normalize_supabase_helper_spacing(generated_section(committed))
    )
    fresh_gen = strip_supabase_internal_metadata(normalize_generated_types(generated))
except RuntimeError as error:
    print(f"ERROR: {error}")
    sys.exit(1)

if committed_gen == fresh_gen:
    print("Generated types match committed file.")
    sys.exit(0)

lines_c = committed_gen.splitlines()
lines_g = fresh_gen.splitlines()

print()
print("ERROR: src/types/database.ts is out of sync with the schema.")
print(f"  Committed: {len(lines_c)} lines")
print(f"  Generated: {len(lines_g)} lines")
print()
print("Regenerate by running:")
print()
print("  npm run gen:types")
print()
print("Or verify without updating:")
print()
print("  npm run validate:types:local")
print("  npm run validate:types:remote:dev")
print()

for i, (a, b) in enumerate(zip(lines_c, lines_g)):
    if a != b:
        print(f"First diff at line {i + 1}:")
        print(f"  committed: {a!r}")
        print(f"  generated: {b!r}")
        break
else:
    if len(lines_c) != len(lines_g):
        print(f"First diff at line {min(len(lines_c), len(lines_g)) + 1}:")
        if len(lines_c) > len(lines_g):
            print(f"  committed: {lines_c[len(lines_g)]!r}")
            print("  generated: <end of file>")
        else:
            print("  committed: <end of file>")
            print(f"  generated: {lines_g[len(lines_c)]!r}")

sys.exit(1)
