# Backend Overview

TailTag uses Supabase for the application backend. Backend code and configuration live under `supabase/`, with supporting scripts in `scripts/`.

## Main responsibilities

- Authentication and session-backed access.
- Postgres schema, functions, views, row-level security, and indexes.
- Storage for profile avatars, fursuit avatars, and catch photos.
- Realtime publications for gameplay and notification updates.
- Edge Functions for privileged workflows and server-side processing.
- Cron jobs and queue processing for scheduled and asynchronous work.
- Reference data for species, colors, achievements, and other app constants.

## Repository layout

- `supabase/config.toml` configures local Supabase services and function JWT settings.
- `supabase/migrations/` contains ordered schema migrations.
- `supabase/seeds/reference.sql` contains reference seed data.
- `supabase/functions/` contains deployable Edge Functions.
- `supabase/functions/_shared/` contains shared Deno helpers for functions.
- `scripts/bootstrap-vault-secrets.sql` derives required Vault secrets from existing project secrets.
- `scripts/setup-environment.sh` links, migrates, seeds, syncs secrets, and deploys functions for a target environment.
- `scripts/verify-environment.sh` smoke-tests a target Supabase environment.

## Edge Functions

Deployable functions currently include:

- `create-catch`
- `delete-account`
- `events-ingress`
- `expire-bans`
- `expire-pending-catches`
- `process-achievements`
- `process-gameplay-queue`
- `rotate-dailys`
- `send-push`
- `staff-moderate`

JWT verification settings are defined in `supabase/config.toml` for local development. Deployment scripts also handle functions that intentionally use `--no-verify-jwt`.

## Data and processing flow

Gameplay writes are stored in Postgres and may trigger downstream processing through database functions, queues, cron jobs, or Edge Functions.

Achievement and daily-task behavior is split between database state, Edge Function processing, and shared TypeScript rule definitions in `packages/achievement-rules/`. Keep shared rule changes and backend migrations in sync when changing achievement behavior.

Push notifications use stored device tokens, notification tables, and the `send-push` function. Realtime subscriptions support immediate in-app updates for notifications, catch confirmations, achievements, daily tasks, and related gameplay state.

## Migrations and seeds

Schema changes should be made with timestamped SQL migrations under `supabase/migrations/`. CI checks migration filename shape and duplicate timestamps.

Reference data belongs in `supabase/seeds/reference.sql`. Environment-specific or private data should not be added to committed seed files.

After schema changes, regenerate database types with:

```bash
npm run gen:types
```

Review generated type changes before committing.

## Environments

TailTag has separate `development`, `staging`, and `production` Supabase targets. Environment provisioning includes migrations, reference seeds, storage buckets, realtime publications, cron jobs, Vault secrets, auth providers, and Edge Function secrets.

Use `docs/environment-setup.md` for the full environment checklist. Use runbooks in `docs/runbooks/` for sync and rollback operations.

## Validation

For backend-related pull requests, run the relevant local checks plus:

```bash
cd packages/achievement-rules
npm run lint
```

When touching migrations or generated database types, also run:

```bash
npm run gen:types
```

For shared environments, use:

```bash
./scripts/verify-environment.sh development
./scripts/verify-environment.sh staging
```

Only run production operations when you intentionally mean to touch production.
