# Convention Silent Repair

Silent repair is for historical convention closeout failures that existed before the explicit
ending lifecycle shipped. It is not a normal closeout path and should not be used for active or
future conventions.

## When to use it

Use silent repair only in development or staging after validating the new lifecycle foundation.
Eligible conventions are stale historical rows in `closed`, `closeout_failed`, or broken `archived`
states.

Do not use silent repair for `draft`, `scheduled`, `live`, `finalizing`, `closeout_running`, or
`canceled` conventions.

## What it does

The `public.silent_repair_historical_convention` RPC:

- archives stale closeout failure state,
- clears `closeout_error`,
- resets closeout retry fields,
- finalizes durable attendance and roster history,
- writes `audit_log.action = 'silent_repair_historical_convention'`,
- marks `closeout_summary.silent_repair = true`.

It does not generate `convention_participant_recaps` rows and does not create
`convention_recap_ready` notifications.

## Admin flow

In dev-project admin surfaces, open the historical convention detail page and use **Silent repair**.
The action is gated by the same dev Supabase project checks as dev delete.

## Verification

After repair:

1. Confirm the convention is `archived`.
2. Confirm `closeout_error` is null and `closeout_summary.silent_repair` is true.
3. Confirm no new `convention_participant_recaps` rows were created for the convention.
4. Confirm no `convention_recap_ready` notifications were created for the convention.
5. Confirm an audit row exists for `silent_repair_historical_convention`.
