# Rollback Runbook

Rollback procedures for each layer of the TailTag stack.
The general principle is **forward-only**: fix forward with a new commit rather
than reverting history, except where noted.

---

## 1. Database Migration

**Approach:** corrective forward migration — never revert a migration file.

1. Identify the problematic migration by checking `supabase_migrations.schema_migrations`
   in the Supabase dashboard or via:
   ```sql
   SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10;
   ```
2. Write a new migration that corrects the schema (add the missing column, drop
   the bad constraint, etc.).
3. Name it with the current timestamp:
   ```
   supabase/migrations/<timestamp>_fix_<description>.sql
   ```
4. Apply it:
   ```bash
   ./scripts/setup-environment.sh <environment>
   # or just:
   npx supabase db push --linked
   ```
5. Verify the fix in the Supabase dashboard Table Editor or via SQL.

**If data was corrupted:** restore from the most recent daily backup via the
Supabase dashboard (Settings → Backups), then reapply any migrations created
after the backup timestamp.

---

## 2. Edge Function

**Approach:** redeploy the last known-good revision from git.

1. Find the last good commit SHA:
   ```bash
   git log --oneline supabase/functions/<function-name>/
   ```
2. Check out the file at that revision:
   ```bash
   git show <sha>:supabase/functions/<function-name>/index.ts > /tmp/good-index.ts
   # review it, then restore:
   git checkout <sha> -- supabase/functions/<function-name>/
   ```
3. Deploy just that function:
   ```bash
   npx supabase functions deploy <function-name> --project-ref <project-ref>
   ```
4. Verify via function logs:
   ```bash
   npx supabase functions logs <function-name> --project-ref <project-ref>
   ```
5. Commit the restored file if the checkout changed working tree state.

**Project refs:**
| Environment | Project ref |
|-------------|-------------|
| development | `rtxbvjicfxgcouufumce` |
| staging     | `yjsadmswobafychfpoxe` |
| production  | `dowtlhkzbxxmiflpswvd` |

---

## 3. Seed / Bootstrap Data

**Approach:** fix the source SQL file and reapply.

Reference data (`supabase/seeds/reference.sql`) uses `ON CONFLICT DO NOTHING`
so it is always safe to reapply. Fixture data (`staging-fixtures.sql`) is the same.

1. Identify the bad row(s) via the dashboard or SQL.
2. Correct `supabase/seeds/reference.sql` (or `staging-fixtures.sql`).
3. Reapply:
   ```bash
   npx supabase db query --linked -f supabase/seeds/reference.sql
   ```
4. If a row needs to be *updated* (not just inserted), add an explicit
   `UPDATE` or `INSERT ... ON CONFLICT (...) DO UPDATE` statement.

**Never run `staging-fixtures.sql` against production.**

---

## 4. Scheduler Job

**Approach:** update the source SQL and reapply via the dashboard.

Cron job definitions live in the Supabase dashboard (Database → Cron Jobs).
There is no committed source file for cron jobs — the dashboard is the source
of truth.

1. Navigate to the Supabase dashboard → Database → Cron Jobs.
2. Identify the affected job.
3. Edit the schedule or SQL directly in the dashboard.
4. If the job was deleted accidentally, recreate it using the schedule below:

| Job | Schedule | Invokes |
|-----|----------|---------|
| `rotate-dailys` | per convention timezone (varies) | `rotate-dailys` edge function |
| `expire-pending-catches` | every 5 minutes | `expire-pending-catches` edge function |
| `expire-bans` | every 5 minutes | `expire-bans` edge function |

5. Test by triggering the job manually from the dashboard.

---

## 5. Mobile App

**Approach:** stop promotion of the bad build; issue a corrected build.

EAS builds are immutable — you cannot modify a published build.

**If the build has not been submitted to the store:**
1. Do not promote or distribute the bad build further.
2. Fix the code, commit, and trigger a new EAS build:
   ```bash
   eas build --profile <development|preview|production> --platform <ios|android|all>
   ```
3. Distribute the new build to testers/reviewers.

**If the build is live in the store:**
1. If the issue is severe, use the store's rollout controls to halt the rollout
   (App Store Connect → Phased Release → Pause; Google Play → Release → Halt rollout).
2. Fix the code, build, and submit a corrected version.
3. For critical backend-only issues, rolling back the edge function or applying a
   DB fix may be sufficient without a new app release.

**OTA updates (Expo Updates):**
If OTA updates are configured, a corrected JS bundle can be published without a
full store release:
```bash
eas update --branch <branch> --message "Fix: <description>"
```

---

## 6. Staging Environment

**Approach:** rebuild from committed assets and fixtures.

If staging becomes corrupted or diverges from a known-good state:

1. Reset the staging database to a clean baseline (Supabase dashboard →
   Settings → Backups, or use the branch reset if using Supabase branching).
2. Rerun the full bootstrap:
   ```bash
   ./scripts/setup-environment.sh staging
   ```
3. This will:
   - Apply all migrations
   - Reapply `reference.sql` and `staging-fixtures.sql`
   - Redeploy all edge functions
4. Manually verify storage buckets, realtime, secrets, and cron jobs are
   present (the script prints the checklist).
5. Install the latest preview build and smoke-test the critical path.

If the staging Supabase project is irrecoverably broken, create a new Supabase
project, update the project ref in `eas.json` and `scripts/setup-environment.sh`,
and run the bootstrap script against it.
