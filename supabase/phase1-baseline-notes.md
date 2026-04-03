# Phase 1 Baseline Notes

These notes capture the repo-side prerequisites for applying the current Supabase baseline to a fresh project during Phase 1.

## Baseline normalization

The baseline migration does not embed a fixed project URL or a live service-role JWT for trigger-driven Edge Function calls.

Instead, the migration now uses database wrapper functions that read these Vault secrets at runtime:

- `SUPABASE_URL`
- `SERVICE_ROLE_KEY`

Those secrets are used by database-side invocations of:

- `process-achievements`
- `send-push`
- `process-gameplay-queue`

## Required post-provision control-plane steps

After creating a fresh Supabase project and applying migrations:

1. Add `SUPABASE_URL` to Supabase Vault with that project's URL.
2. Add `SERVICE_ROLE_KEY` to Supabase Vault with that project's service-role key.
3. Deploy the referenced Edge Functions before enabling any trigger or scheduler that depends on them.

## Remaining Phase 1 work

This note only covers the trigger normalization prerequisites. Storage setup, scheduler setup, verification assets, and function inventory reconciliation still need to be added separately.
