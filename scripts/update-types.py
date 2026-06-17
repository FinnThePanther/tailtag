#!/usr/bin/env python3
"""
Replaces the generated portion of src/types/database.ts with fresh output
from the Supabase CLI, preserving the manually maintained type aliases.

Usage:
  python3 scripts/update-types.py <generated-types-file>
"""
import sys
import os
import subprocess

if len(sys.argv) != 2:
    print("Usage: update-types.py <generated-types-file>")
    sys.exit(1)

generated = open(sys.argv[1]).read().rstrip()


def strip_supabase_cli_notices(source):
    return "\n".join(
        line
        for line in source.splitlines()
        if not line.startswith("A new version of Supabase CLI is available:")
        and not line.startswith("We recommend updating regularly for new features")
    ).rstrip()


def normalize_supabase_helper_spacing(source):
    helpers = [
        "type DatabaseWithoutInternals",
        "type DefaultSchema",
        "export type Tables<",
        "export type TablesInsert<",
        "export type TablesUpdate<",
        "export type Enums<",
        "export type CompositeTypes<",
        "export const Constants",
        "// Type aliases for application use",
    ]
    for helper in helpers:
        source = source.replace(f"\n\n{helper}", f"\n{helper}")
    return source


def replace_required(source, anchor, replacement):
    if anchor not in source:
        raise RuntimeError(f"Expected generated type anchor not found: {anchor!r}")
    updated = source.replace(anchor, replacement)
    if updated == source:
        raise RuntimeError(f"Generated type replacement did not change output for: {anchor!r}")
    return updated


def replace_first_available(source, replacements):
    for anchor, replacement in replacements:
        if anchor in source:
            return replace_required(source, anchor, replacement)
    anchors = ", ".join(repr(anchor) for anchor, _ in replacements)
    raise RuntimeError(f"Expected generated type anchor not found; tried: {anchors}")


def normalize_gameplay_dead_letter_replay_result(source):
    # Supabase CLI currently emits scalar RETURNS TABLE columns as non-nullable.
    # replay_gameplay_dead_letter_events returns null queue_message_id for skipped rows.
    anchor = (
        "      replay_gameplay_dead_letter_events: {\n"
        "        Args: { p_actor_id: string; p_event_ids: string[]; p_reason: string }\n"
        "        Returns: {\n"
        "          event_id: string\n"
        "          message: string\n"
        "          queue_message_id: number\n"
        "          replayed: boolean\n"
        "          status: string\n"
        "        }[]\n"
        "      }"
    )
    nullable_anchor = anchor.replace("queue_message_id: number", "queue_message_id: number | null")
    if nullable_anchor in source:
        return source

    replacement = anchor.replace("queue_message_id: number", "queue_message_id: number | null")
    return replace_required(source, anchor, replacement)


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
        raise RuntimeError(result.stderr)
    return result.stdout.rstrip()


attendance_state_type = 'export type AttendanceState = "active" | "left" | "removed" | "finalized"'
roster_state_type = 'export type RosterState = "active" | "removed" | "finalized"'

generated = strip_supabase_cli_notices(generated)

generated = replace_first_available(
    generated,
    [
        (
            '  | Json[]\n\nexport type Database = {',
            '  | Json[]\n\n'
            + attendance_state_type
            + "\n"
            + roster_state_type
            + "\n\nexport type Database = {",
        ),
        (
            '  | Json[]\nexport type Database = {',
            '  | Json[]\n\n'
            + attendance_state_type
            + "\n"
            + roster_state_type
            + "\n\nexport type Database = {",
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
generated = normalize_gameplay_dead_letter_replay_result(generated)

if attendance_state_type not in generated:
    raise RuntimeError(f"Generated output is missing final type declaration: {attendance_state_type}")
if roster_state_type not in generated:
    raise RuntimeError(f"Generated output is missing final type declaration: {roster_state_type}")

generated = format_typescript(generated)
generated = normalize_supabase_helper_spacing(generated)

committed = open("src/types/database.ts").read()
boundary = "// Type aliases for application use"
idx = committed.find(boundary)
aliases = committed[idx:].rstrip() if idx != -1 else ""

new_content = generated + "\n\n" + aliases + "\n" if aliases else generated + "\n"

with open("src/types/database.ts", "w") as f:
    f.write(new_content)

print("src/types/database.ts updated.")
