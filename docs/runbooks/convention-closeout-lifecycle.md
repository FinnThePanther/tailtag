# Convention Closeout Lifecycle

Use this runbook to validate and operate the convention-ending lifecycle in development or staging.
It covers normal finalizing closeout, failed closeout retry, recap regeneration, and historical
silent repair.

This runbook does not authorize production silent repair. Production repair requires an explicit
approval and a separate production-specific plan.

## Before validation

- Confirm the admin deployment points at the intended Supabase project:
  - development: `rtxbvjicfxgcouufumce`
  - staging: `yjsadmswobafychfpoxe`
- Confirm the admin user has a role allowed to perform convention lifecycle actions.
- Confirm `ADMIN_REPAIR_SUPABASE_PROJECT_REFS` includes only approved repair environments before
  testing silent repair. Use `rtxbvjicfxgcouufumce` for dev and `yjsadmswobafychfpoxe` for staging.
- Keep dev delete separate from silent repair. Dev delete remains a dev-only cleanup control and is
  not part of lifecycle validation.
- Do not use silent repair for active lifecycle states such as `draft`, `scheduled`, `live`,
  `finalizing`, `closeout_running`, or `canceled`.

## Admin state checks

### Finalizing, not due

Expected admin behavior:

- Status shows `finalizing`.
- Finalizing deadline is visible.
- Close and archive is disabled until `closeout_not_before`.
- Retry closeout and regenerate recaps are unavailable.

### Finalizing, due

Expected admin behavior:

- Status shows `finalizing`.
- Finalizing deadline is at or before the current time.
- Close and archive is enabled.
- Successful closeout archives the convention and reports the recap count.
- If the Edge Function returns `not_due`, admin shows "Closeout is not due yet."
- If another process owns the lock, admin shows "Closeout is already running."

### Closeout running

Expected admin behavior:

- Status shows `closeout_running`.
- Closeout step and attempt timestamps are visible when present.
- Retry closeout is not used while the closeout lock is active.
- Players should see delayed/finalizing copy rather than internal errors.

### Closeout failed

Expected admin behavior:

- Status shows `closeout_failed`.
- Failed step, retry count, retry mode, and last error are visible.
- Retry closeout is enabled.
- Retry resumes closeout through the normal closeout path; it is separate from recap regeneration.
- If retry count reaches the cap, admin shows manual retry required.

### Archived

Expected admin behavior:

- Status shows `archived`.
- Archive summary and recap count are visible.
- Regenerate recaps is enabled.
- Close and retry are unavailable.
- Regeneration reports the regenerated participant recap count.

## Historical silent repair

Silent repair is only for stale historical conventions that already failed before the explicit
ending lifecycle shipped. For details, see
[`convention-silent-repair.md`](./convention-silent-repair.md).

Expected admin behavior:

- Silent repair appears only when the current Supabase project ref is listed in
  `ADMIN_REPAIR_SUPABASE_PROJECT_REFS`.
- Silent repair is separate from retry closeout and regenerate recaps.
- The confirmation copy states that no recaps and no player notifications are created.
- Successful repair marks the convention archived and flags `closeout_summary.silent_repair`.

After silent repair, verify:

1. The convention is `archived`.
2. `closeout_error` is null.
3. `closeout_summary.silent_repair` is true.
4. No new `convention_participant_recaps` rows were created for the convention.
5. No `convention_recap_ready` notifications were created for the convention.
6. An audit row exists for `silent_repair_historical_convention`.

## Suggested verification queries

Use the Supabase SQL editor or an approved database query workflow. Replace `<convention_id>` with
the target convention ID.

```sql
select
  id,
  status,
  closeout_step,
  closeout_retry_count,
  closeout_error,
  closeout_summary
from public.conventions
where id = '<convention_id>';
```

```sql
select count(*) as recap_count
from public.convention_participant_recaps
where convention_id = '<convention_id>';
```

```sql
select count(*) as recap_ready_notification_count
from public.notifications
where type = 'convention_recap_ready'
  and payload->>'convention_id' = '<convention_id>';
```

```sql
select action, created_at, context
from public.audit_log
where entity_type = 'convention'
  and entity_id = '<convention_id>'
  and action in (
    'close_convention_attempt',
    'close_convention_complete',
    'close_convention_failed',
    'regenerate_convention_recaps_attempt',
    'regenerate_convention_recaps_complete',
    'silent_repair_historical_convention'
  )
order by created_at desc
limit 20;
```
