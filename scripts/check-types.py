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
import os
import subprocess

if len(sys.argv) != 2:
    print("Usage: check-types.py <generated-types-file>")
    sys.exit(1)

committed = open("src/types/database.ts").read()
generated = open(sys.argv[1]).read()


def replace_required(source, anchor, replacement):
    if anchor not in source:
        print(f"ERROR: expected generated type anchor not found: {anchor!r}")
        sys.exit(1)
    updated = source.replace(anchor, replacement)
    if updated == source:
        print(f"ERROR: generated type replacement did not change output for: {anchor!r}")
        sys.exit(1)
    return updated


def replace_first_available(source, replacements):
    for anchor, replacement in replacements:
        if anchor in source:
            return replace_required(source, anchor, replacement)
    print(
        "ERROR: expected generated type anchor not found; tried: "
        + ", ".join(repr(anchor) for anchor, _ in replacements)
    )
    sys.exit(1)


def format_typescript(source):
    prettier = os.path.join("node_modules", ".bin", "prettier")
    if not os.path.exists(prettier):
        return source
    result = subprocess.run(
        [prettier, "--stdin-filepath", "src/types/database.ts"],
        input=source,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        print(result.stderr)
        sys.exit(result.returncode)
    return result.stdout


generated = replace_first_available(
    generated,
    [
        (
            '  | Json[]\n\nexport type Database = {',
            '  | Json[]\n\n'
            'export type AttendanceState = "active" | "left" | "removed" | "finalized"\n'
            'export type RosterState = "active" | "removed" | "finalized"\n\n'
            'export type Database = {',
        ),
        (
            '  | Json[]\nexport type Database = {',
            '  | Json[]\n\n'
            'export type AttendanceState = "active" | "left" | "removed" | "finalized"\n'
            'export type RosterState = "active" | "removed" | "finalized"\n\n'
            'export type Database = {',
        ),
    ],
)
generated = replace_required(generated, "roster_state: string", "roster_state: RosterState")
generated = replace_required(generated, "roster_state?: string", "roster_state?: RosterState")
generated = replace_required(
    generated, "attendance_state: string", "attendance_state: AttendanceState"
)
generated = replace_required(
    generated, "attendance_state?: string", "attendance_state?: AttendanceState"
)
generated = format_typescript(generated)

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
