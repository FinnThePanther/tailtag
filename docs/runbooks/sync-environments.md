# Environment Sync Runbook

How TailTag's `dev`, `staging`, and `production` Supabase projects stay aligned,
and how to deploy from one to the next.

| Branch | Project ref           | Environment |
| ------ | --------------------- | ----------- |
| `dev`  | `rtxbvjicfxgcouufumce` | development |
| `dev`  | `yjsadmswobafychfpoxe` | **staging** (auto-deployed from `dev`) |
| `main` | `dowtlhkzbxxmiflpswvd` | **production** (auto-deployed from `main`) |

---

## Continuous sync (the happy path)

The [Delivery workflow](../../.github/workflows/branch-delivery.yml) is
triggered on every push to `dev` and `main`. When backend surfaces change, it
performs the same backend deployment for the matching environment:

1. **Apply migrations** — `supabase db push --linked`
2. **Apply reference seed data** — `supabase/seeds/reference.sql`
3. **Sync `SERVICE_ROLE_KEY`** — into both vault and edge function secrets
4. **Bootstrap derived vault secrets** — runs
   `scripts/bootstrap-vault-secrets.sql`, which idempotently seeds
   `rotate_dailys_service_role_key`, `project_url`,
   `ACHIEVEMENTS_PROCESSOR_URL`, etc. entirely from values already in the vault
5. **Deploy edge functions** — every directory under `supabase/functions/`
   that contains an `index.ts` is deployed (no hardcoded list)
6. **Verify environment** — runs `scripts/verify-environment.sh` as a smoke
   test (realtime publication, cron jobs, queue, vault, storage)

The backend deployment job only runs when files under `supabase/**`,
`packages/achievement-rules/**`, or supporting deployment scripts change.

### Required GitHub secrets

The workflow needs these secrets per environment (already configured in the
`staging` and `production` GitHub environments):

| Secret                       | Used for                                       |
| ---------------------------- | ---------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`      | CLI auth (org-wide)                            |
| `STAGING_PROJECT_REF`        | `yjsadmswobafychfpoxe`                         |
| `STAGING_DB_PASSWORD`        | DB password for `db push` / `db query`         |
| `STAGING_SERVICE_ROLE_KEY`   | Seeded into vault and edge function secrets    |
| `PROD_PROJECT_REF`           | `dowtlhkzbxxmiflpswvd`                         |
| `PROD_DB_PASSWORD`           | DB password for `db push` / `db query`         |
| `PROD_SERVICE_ROLE_KEY`      | Seeded into vault and edge function secrets    |

---

## Sync staging → production

Production deploys are triggered by pushes to `main`. The mechanics are
identical to staging — same workflow, different environment secrets.

For mobile release versioning, tag naming, and `dev`/`main` sync rules, use
[`release-management.md`](./release-management.md).

### Standard release

```bash
# 1. Make sure dev is green and staging passes verification
./scripts/verify-environment.sh staging

# 2. Open a PR from dev → main
gh pr create --base main --head dev --title "Release: <date>" --body "..."

# 3. Merge after review. Delivery picks up the push to main and
#    deploys to production automatically.
```

The workflow runs the same six steps against the production project, then
runs `verify-environment.sh production` as a smoke test. Failures stop the
deploy.

### Hotfix

For urgent fixes, branch directly off `main`, then PR back into `main`:

```bash
git checkout main && git pull
git checkout -b hotfix/<short-name>
# … fix …
git push -u origin hotfix/<short-name>
gh pr create --base main --title "hotfix: …"
```

After the hotfix merges to `main` and is auto-deployed to production,
**immediately back-port or fast-forward to `dev`**:

```bash
git checkout dev && git pull --ff-only origin dev
git merge --ff-only origin/main || git merge origin/main
git push origin dev
```

This keeps `dev` from missing production-only commits so the next regular
release doesn't roll back the hotfix.

### Pre-flight checklist

Before pushing to `main`:

- [ ] `./scripts/verify-environment.sh staging` is green
- [ ] All migrations needed by the release exist in `supabase/migrations/`
      (migrations created by hand on dev via the MCP must be captured to a
      file before they can flow to staging/prod — see _Capturing manual
      changes_ below)
- [ ] No new vault secrets are required by the release. If a new secret is
      needed, add it to `scripts/bootstrap-vault-secrets.sql` so it'll be
      seeded automatically on every deploy
- [ ] No new edge functions need extra secrets that the workflow doesn't
      already set
- [ ] `npm run ci:validate` is passing on `dev`

### Post-deploy verification

After the workflow completes:

```bash
./scripts/verify-environment.sh production
```

The CI step does this automatically, but it's worth running locally to
confirm. Then check:

- Daily-task rotation is producing rows for the current day:
  ```sql
  SELECT day, count(*) FROM daily_assignments
  WHERE day = current_date GROUP BY day;
  ```
- The gameplay queue worker is processing events:
  ```sql
  SELECT count(*) FILTER (WHERE processed_at IS NOT NULL) AS processed,
         count(*) FILTER (WHERE processed_at IS NULL)     AS pending
  FROM events
  WHERE received_at > now() - interval '1 hour';
  ```
- A test catch end-to-end on a TestFlight/preview build flows through
  events-ingress → process-gameplay-queue → notification.

---

## Capturing manual changes from dev → migration

If you make a hand-applied change on dev (e.g. via the Supabase MCP, the
SQL editor, or `psql`), it **must** be captured into a migration file before
it can propagate to staging and production. Otherwise it just sits as drift.

```bash
# Pull a diff against the latest migration baseline
npx supabase db diff --linked --schema public,app_private \
  -f $(date -u +%Y%m%d%H%M%S)_describe_change

# Inspect the generated file, prune anything you didn't intend, then commit
git add supabase/migrations/<new>.sql
git commit -m "capture <change> from dev"
```

Push to `dev` → CI applies the migration to staging via `db push --linked`.

> **Cron jobs and vault secrets are NOT in `db diff` output.** If you change
> a cron schedule or add a vault secret on dev, you must update
> [`supabase/migrations/20260408231500_sync_dev_drift.sql`](../../supabase/migrations/20260408231500_sync_dev_drift.sql)
> (for cron) or
> [`scripts/bootstrap-vault-secrets.sql`](../../scripts/bootstrap-vault-secrets.sql)
> (for secrets) by hand.

---

## Manual environment sync (escape hatch)

If CI is broken or you need to bring an environment up from scratch, run the
bootstrap script locally:

```bash
# Authenticate the Supabase CLI once
npx supabase login

# Bootstrap an environment end-to-end. This is idempotent.
./scripts/setup-environment.sh staging
./scripts/setup-environment.sh production   # prompts for confirmation

# Verify
./scripts/verify-environment.sh staging
./scripts/verify-environment.sh production
```

`setup-environment.sh` performs the same six steps as the CI workflow plus
the gameplay-queue creation guard.

---

## Known drift sources to watch for

These are the categories of state that historically have drifted between
environments. Each is now captured by either a migration, the bootstrap
script, or the verify script — but it's worth knowing about them.

| Drift source                              | Captured by                                          |
| ----------------------------------------- | ---------------------------------------------------- |
| `app_private.*` functions                 | `migrations/20260408231500_sync_dev_drift.sql`       |
| Cron jobs (schedules and commands)        | `migrations/20260408231500_sync_dev_drift.sql`       |
| Derived vault secrets                     | `scripts/bootstrap-vault-secrets.sql`                |
| Edge function set                         | Workflow loops over `supabase/functions/*/index.ts`  |
| Realtime publication membership           | `verify-environment.sh` checks; add via migration    |
| Storage buckets and policies              | `docs/environment-setup.md`                          |
| `SERVICE_ROLE_KEY` in vault               | Workflow `Sync SERVICE_ROLE_KEY` step                |
