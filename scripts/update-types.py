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


def replace_required(source, anchor, replacement):
    if anchor not in source:
        raise RuntimeError(f"Expected generated type anchor not found: {anchor!r}")
    updated = source.replace(anchor, replacement)
    if updated == source:
        raise RuntimeError(f"Generated type replacement did not change output for: {anchor!r}")
    return updated


attendance_state_type = 'export type AttendanceState = "active" | "left" | "removed" | "finalized"'
roster_state_type = 'export type RosterState = "active" | "removed" | "finalized"'

generated = replace_required(
    generated,
    '  | Json[]\n\nexport type Database = {',
    '  | Json[]\n\n' + attendance_state_type + "\n" + roster_state_type + "\n\nexport type Database = {",
)
generated = replace_required(generated, "roster_state: string", "roster_state: RosterState")
generated = replace_required(generated, "roster_state?: string", "roster_state?: RosterState")
generated = replace_required(
    generated, "attendance_state: string", "attendance_state: AttendanceState"
)
generated = replace_required(
    generated, "attendance_state?: string", "attendance_state?: AttendanceState"
)

if attendance_state_type not in generated:
    raise RuntimeError(f"Generated output is missing final type declaration: {attendance_state_type}")
if roster_state_type not in generated:
    raise RuntimeError(f"Generated output is missing final type declaration: {roster_state_type}")

committed = open("src/types/database.ts").read()
boundary = "// Type aliases for application use"
idx = committed.find(boundary)
aliases = committed[idx:].rstrip() if idx != -1 else ""

new_content = generated + "\n\n" + aliases + "\n" if aliases else generated + "\n"

with open("src/types/database.ts", "w") as f:
    f.write(new_content)

print("src/types/database.ts updated.")
