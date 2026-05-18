# Convention Silent Repair

Silent repair is for historical convention closeout failures that existed before the explicit
ending lifecycle shipped. It is not a normal closeout path and should not be used for active or
future conventions.

For full closeout lifecycle validation, use
[`convention-closeout-lifecycle.md`](./convention-closeout-lifecycle.md).

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

In configured repair admin surfaces, open the historical convention detail page and use
**Silent repair**. The action is gated by `ADMIN_REPAIR_SUPABASE_PROJECT_REFS`, a comma-separated
list of Supabase project refs where historical repair is approved.

Use `rtxbvjicfxgcouufumce` for dev and `yjsadmswobafychfpoxe` for staging. Do not include
production unless production repair has separate explicit approval.

Dev delete remains separate from silent repair. Dev delete is still dev-only and should not be used
as part of lifecycle repair validation.

## Verification

After repair:

1. Confirm the convention is `archived`.
2. Confirm `closeout_error` is null and `closeout_summary.silent_repair` is true.
3. Confirm no new `convention_participant_recaps` rows were created for the convention.
4. Confirm no `convention_recap_ready` notifications were created for the convention.
5. Confirm an audit row exists for `silent_repair_historical_convention`.
