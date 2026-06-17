#!/usr/bin/env python3
"""Run a post-deploy canary through TailTag's gameplay event queue."""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
from typing import Any


CANARY_EVENT_TYPE = "backend_canary"
CANARY_USER_ID = "00000000-0000-4000-8000-000000000151"


class CanaryError(Exception):
    def __init__(self, stage: str, message: str):
        super().__init__(message)
        self.stage = stage
        self.message = message


def parse_args() -> dict[str, str]:
    args = sys.argv[1:]
    if args in (["--help"], ["-h"]):
        print("Usage: run-event-processing-canary.py --environment ENV --project-ref PROJECT_REF")
        sys.exit(0)

    values: dict[str, str] = {}
    index = 0
    while index < len(args):
        key = args[index]
        if key not in ("--environment", "--project-ref"):
            print(f"Unknown argument: {key}", file=sys.stderr)
            sys.exit(2)
        if index + 1 >= len(args):
            print(f"Missing value for {key}", file=sys.stderr)
            sys.exit(2)
        values[key.removeprefix("--").replace("-", "_")] = args[index + 1]
        index += 2

    missing = [key for key in ("environment", "project_ref") if key not in values]
    if missing:
        print(f"Missing required argument(s): {', '.join(missing)}", file=sys.stderr)
        sys.exit(2)
    return values


def supabase_cli() -> list[str]:
    raw = os.environ.get("SUPABASE_CLI", "supabase")
    return shlex.split(raw)


def extract_json(raw: str) -> Any:
    candidates = []
    for opener, closer in (("{", "}"), ("[", "]")):
        start = raw.find(opener)
        end = raw.rfind(closer)
        if start != -1 and end != -1 and end >= start:
            candidates.append(raw[start : end + 1])

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    raise ValueError("Supabase CLI output did not contain JSON")


def run_db_query(sql: str, stage: str) -> list[dict[str, Any]]:
    result = subprocess.run(
        [*supabase_cli(), "db", "query", "--linked", "--output", "json", sql],
        check=False,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise CanaryError(stage, detail or "Supabase query failed")

    try:
        parsed = extract_json(result.stdout)
    except ValueError as error:
        raise CanaryError(stage, str(error)) from error

    if isinstance(parsed, list):
        return [row for row in parsed if isinstance(row, dict)]
    if isinstance(parsed, dict):
        rows = parsed.get("rows") or parsed.get("data")
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
        return [parsed]
    return []


def query_value(sql: str, stage: str) -> str:
    rows = run_db_query(sql, stage)
    if not rows:
        return ""
    first = rows[0]
    if not first:
        return ""
    value = next(iter(first.values()))
    return "" if value is None else str(value).strip()


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def ensure_canary_user(environment: str) -> None:
    email = f"backend-canary-{environment}@tailtag.local"
    run_db_query(
        f"""
        insert into auth.users (
          id,
          aud,
          role,
          email,
          encrypted_password,
          email_confirmed_at,
          created_at,
          updated_at,
          raw_app_meta_data,
          raw_user_meta_data
        )
        values (
          {sql_literal(CANARY_USER_ID)}::uuid,
          'authenticated',
          'authenticated',
          {sql_literal(email)},
          '',
          now(),
          now(),
          now(),
          '{{"provider":"backend_canary","providers":["backend_canary"],"backend_canary":true}}'::jsonb,
          '{{"system":"backend_canary"}}'::jsonb
        )
        on conflict (id) do update
        set
          updated_at = now(),
          raw_app_meta_data = excluded.raw_app_meta_data,
          raw_user_meta_data = excluded.raw_user_meta_data
        returning id::text;
        """,
        "ingest",
    )


def load_secret(name: str) -> str:
    value = query_value(
        f"""
        select decrypted_secret
        from vault.decrypted_secrets
        where name = {sql_literal(name)}
        order by created_at desc
        limit 1;
        """,
        "ingest",
    )
    if not value:
        raise CanaryError("ingest", f"Vault secret {name} is missing or empty")
    return value


def http_json(
    url: str,
    service_role_key: str,
    payload: dict[str, Any],
    stage: str,
) -> tuple[int, dict[str, Any], str]:
    result = subprocess.run(
        [
            "curl",
            "--silent",
            "--show-error",
            "--max-time",
            "20",
            "--request",
            "POST",
            "--header",
            f"Authorization: Bearer {service_role_key}",
            "--header",
            f"apikey: {service_role_key}",
            "--header",
            "Content-Type: application/json",
            "--data",
            json.dumps(payload),
            "--write-out",
            "\n%{http_code}",
            url,
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise CanaryError(stage, detail or f"Unable to reach {url}")

    text, _, raw_status = result.stdout.rpartition("\n")
    try:
        status = int(raw_status)
    except ValueError as error:
        raise CanaryError(stage, f"curl response missing HTTP status: {result.stdout}") from error

    try:
        parsed = json.loads(text) if text else {}
    except json.JSONDecodeError:
        parsed = {}

    return status, parsed, text


def create_canary_event(
    supabase_url: str,
    service_role_key: str,
    environment: str,
    project_ref: str,
) -> str:
    run_id = os.urandom(16).hex()
    status, parsed, text = http_json(
        f"{supabase_url.rstrip('/')}/functions/v1/events-ingress",
        service_role_key,
        {
            "type": CANARY_EVENT_TYPE,
            "user_id": CANARY_USER_ID,
            "idempotency_key": f"backend-canary:{environment}:{run_id}",
            "payload": {
                "canary": True,
                "environment": environment,
                "project_ref": project_ref,
                "run_id": run_id,
                "source": "scripts/run-event-processing-canary.py",
            },
        },
        "ingest",
    )

    if status != 201:
        raise CanaryError("ingest", f"events-ingress returned HTTP {status}: {text}")

    event_id = parsed.get("event_id")
    if not isinstance(event_id, str) or not event_id:
        raise CanaryError("ingest", f"events-ingress response missing event_id: {text}")
    return event_id


def load_event_status(event_id: str, stage: str) -> dict[str, Any]:
    rows = run_db_query(
        f"""
        select
          event_id::text,
          type,
          queue_name,
          queue_message_id,
          enqueued_at::text,
          processed_at::text,
          last_attempted_at::text,
          last_error,
          dead_lettered_at::text,
          dead_letter_reason
        from public.events
        where event_id = {sql_literal(event_id)}::uuid
        limit 1;
        """,
        stage,
    )

    if not rows:
        raise CanaryError(stage, f"Canary event {event_id} was not persisted")
    return rows[0]


def verify_queue_send(event_id: str) -> None:
    status = load_event_status(event_id, "queue send")
    if status.get("type") != CANARY_EVENT_TYPE:
        raise CanaryError("queue send", f"Unexpected canary event type: {status.get('type')}")
    if status.get("queue_name") != "gameplay_event_processing":
        raise CanaryError("queue send", "Canary event did not record gameplay queue name")
    if status.get("queue_message_id") in (None, ""):
        raise CanaryError("queue send", "Canary event did not record a queue message id")
    if status.get("enqueued_at") in (None, ""):
        raise CanaryError("queue send", "Canary event did not record enqueued_at")


def run_worker(
    supabase_url: str,
    service_role_key: str,
    event_id: str,
) -> dict[str, Any]:
    status, parsed, text = http_json(
        f"{supabase_url.rstrip('/')}/functions/v1/process-gameplay-queue",
        service_role_key,
        {"canaryEventId": event_id, "maxMessages": 1, "maxDurationMs": 2000},
        "worker execution",
    )

    if status in (401, 403):
        raise CanaryError("worker auth", f"process-gameplay-queue returned HTTP {status}: {text}")
    if status != 200:
        raise CanaryError(
            "worker execution",
            f"process-gameplay-queue returned HTTP {status}: {text}",
        )
    if parsed.get("canary") is not True:
        raise CanaryError("worker execution", f"Worker did not report canary mode: {text}")
    if parsed.get("failed") not in (0, None):
        raise CanaryError("worker execution", f"Worker reported failed canary processing: {text}")
    return parsed


def verify_processed(event_id: str) -> None:
    status = load_event_status(event_id, "status stamping")
    if status.get("dead_lettered_at"):
        raise CanaryError(
            "status stamping",
            f"Canary event was dead-lettered: {status.get('dead_letter_reason')}",
        )
    if status.get("last_error"):
        raise CanaryError("status stamping", f"Canary event recorded last_error: {status['last_error']}")
    if not status.get("last_attempted_at"):
        raise CanaryError("status stamping", "Canary event never recorded last_attempted_at")
    if not status.get("processed_at"):
        raise CanaryError("status stamping", "Canary event never recorded processed_at")


def main() -> int:
    args = parse_args()

    try:
        ensure_canary_user(args["environment"])
        supabase_url = load_secret("SUPABASE_URL")
        service_role_key = load_secret("SERVICE_ROLE_KEY")
        event_id = create_canary_event(
            supabase_url,
            service_role_key,
            args["environment"],
            args["project_ref"],
        )
        verify_queue_send(event_id)
        run_worker(supabase_url, service_role_key, event_id)
        verify_processed(event_id)
    except CanaryError as error:
        print(f"Canary failed during {error.stage}: {error.message}", file=sys.stderr)
        return 1

    print("Canary event processed successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
