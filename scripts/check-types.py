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

if len(sys.argv) != 2:
    print("Usage: check-types.py <generated-types-file>")
    sys.exit(1)

committed = open("src/types/database.ts").read()
generated = open(sys.argv[1]).read()

boundary = "// Type aliases for application use"
idx = committed.find(boundary)
committed_gen = committed[:idx].rstrip() if idx != -1 else committed.rstrip()
fresh_gen = generated.rstrip()

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
print("  npx supabase gen types typescript --project-id rtxbvjicfxgcouufumce > /tmp/fresh.ts")
print("  python3 scripts/check-types.py /tmp/fresh.ts  # verify locally")
print()
print("Then update src/types/database.ts: replace the generated section with")
print("the new output and preserve the manual aliases at the bottom.")
print()

for i, (a, b) in enumerate(zip(lines_c, lines_g)):
    if a != b:
        print(f"First diff at line {i + 1}:")
        print(f"  committed: {a!r}")
        print(f"  generated: {b!r}")
        break

sys.exit(1)
