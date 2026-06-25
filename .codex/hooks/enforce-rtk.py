#!/usr/bin/env python3
"""Enforce TailTag's RTK command policy for Codex shell tool calls."""

from __future__ import annotations

import json
import shlex
import sys
from typing import Any


ALLOWED_COMMANDS = {"rtk", "npm", "supabase"}


def nested_get(payload: dict[str, Any], *path: str) -> str:
    value: Any = payload
    for key in path:
        if not isinstance(value, dict):
            return ""
        value = value.get(key)
    return value if isinstance(value, str) else ""


def extract_command(payload: dict[str, Any]) -> str:
    candidates = (
        payload.get("command"),
        nested_get(payload, "tool_input", "command"),
        nested_get(payload, "input", "command"),
        nested_get(payload, "tool_input", "cmd"),
        nested_get(payload, "input", "cmd"),
    )

    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()

    return ""


def first_shell_token(command: str) -> str:
    try:
        tokens = shlex.split(command)
    except ValueError:
        tokens = command.split()

    return tokens[0] if tokens else ""


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        print(f"RTK policy hook could not parse Codex hook JSON: {error}", file=sys.stderr)
        return 2

    if not isinstance(payload, dict):
        print("RTK policy hook expected a JSON object payload.", file=sys.stderr)
        return 2

    command = extract_command(payload)
    if not command:
        return 0

    first_token = first_shell_token(command)
    if first_token in ALLOWED_COMMANDS:
        return 0

    allowed_list = ", ".join(f"`{command}`" for command in sorted(ALLOWED_COMMANDS))
    print(
        "Blocked shell command: TailTag requires Codex shell commands to start "
        f"with one of {allowed_list}.\nCommand: {command}",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
