#!/usr/bin/env python3
"""Enforce TailTag's RTK command policy for Codex shell tool calls."""

from __future__ import annotations

import json
import shlex
import sys
from typing import Any


ALLOWED_COMMANDS = {"rtk", "npm", "supabase"}
APPROVED_PREAMBLE_COMMANDS = {"cd", "export", "set", "source", "."}
SHELL_SEPARATORS = {"&&", ";", "||"}


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


def shell_tokens(command: str) -> list[str]:
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        return list(lexer)
    except ValueError:
        return command.split()


def first_shell_token(command: str) -> str:
    tokens = shell_tokens(command)

    return tokens[0] if tokens else ""


def starts_with_allowed_command(tokens: list[str]) -> bool:
    first_token = tokens[0] if tokens else ""

    if first_token in ALLOWED_COMMANDS:
        return True

    if first_token != "env":
        return False

    for token in tokens[1:]:
        if "=" in token and not token.startswith("-"):
            continue
        return token in ALLOWED_COMMANDS

    return False


def command_is_allowed(command: str) -> bool:
    tokens = shell_tokens(command)
    current_segment: list[str] = []
    saw_allowed_command = False

    for token in [*tokens, ";"]:
        if token not in SHELL_SEPARATORS:
            current_segment.append(token)
            continue

        if not current_segment:
            current_segment = []
            continue

        if starts_with_allowed_command(current_segment):
            saw_allowed_command = True
            current_segment = []
            continue

        if saw_allowed_command or current_segment[0] not in APPROVED_PREAMBLE_COMMANDS:
            return False

        current_segment = []

    return saw_allowed_command


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
        print(
            "RTK policy hook could not determine the shell command from the Codex hook payload.",
            file=sys.stderr,
        )
        return 2

    if command_is_allowed(command):
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
