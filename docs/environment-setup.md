# Environment Setup Guide

This document covers configuration that **cannot be captured by database migrations** and must be set up manually (or via the provided SQL scripts) for each Supabase project.

When creating a new environment (staging or production), complete these steps **after** applying the baseline migration and seed data.

---

## 1. Storage Buckets

Three buckets are required. Create them in the Supabase dashboard under **Storage** or run the setup script below.

| Bucket | Public | Size Limit | Allowed MIME Types |
|---|---|---|---|
| `fursuit-avatars` | Yes | 5 MB | All |
| `profile-avatars` | Yes | 5 MB | All |
| `catch-photos` | Yes | None | `image/jpeg`, `image/jpg`, `image/png`, `image/webp` |

### Storage Policies

All buckets follow the same pattern: **public read, owner-scoped write/update/delete.**

Owner is determined by the first folder segment matching `auth.uid()`.

<details>
<summary>SQL to create buckets and policies</summary>

```sql
-- Create buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('fursuit-avatars', 'fursuit-avatars', true, 5242880, null),
  ('profile-avatars', 'profile-avatars', true, 5242880, null),
  ('catch-photos',    'catch-photos',    true, null,    '{"image/jpeg","image/jpg","image/png","image/webp"}')
ON CONFLICT (id) DO NOTHING;

-- fursuit-avatars policies
CREATE POLICY "fursuit_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'fursuit-avatars');
CREATE POLICY "fursuit_owner_write" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'fursuit-avatars' AND split_part(name, '/', 1) = auth.uid()::text);
CREATE POLICY "fursuit_owner_update" ON storage.objects FOR UPDATE USING (bucket_id = 'fursuit-avatars' AND split_part(name, '/', 1) = auth.uid()::text) WITH CHECK (bucket_id = 'fursuit-avatars' AND split_part(name, '/', 1) = auth.uid()::text);
CREATE POLICY "fursuit_owner_delete" ON storage.objects FOR DELETE USING (bucket_id = 'fursuit-avatars' AND split_part(name, '/', 1) = auth.uid()::text);

-- profile-avatars policies
CREATE POLICY "Anyone can view profile avatars" ON storage.objects FOR SELECT USING (bucket_id = 'profile-avatars');
CREATE POLICY "Users can upload own profile avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'profile-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own profile avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'profile-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own profile avatar" ON storage.objects FOR DELETE USING (bucket_id = 'profile-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- catch-photos policies
CREATE POLICY "catch_photos_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'catch-photos');
CREATE POLICY "catch_photos_auth_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'catch-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "catch_photos_user_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'catch-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "catch_photos_user_delete" ON storage.objects FOR DELETE USING (bucket_id = 'catch-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
```

</details>

---

## 2. Realtime Publications

The following tables must be added to the `supabase_realtime` publication for live subscriptions to work. Configure in the Supabase dashboard under **Database > Replication** or run the SQL below.

| Table | Purpose |
|---|---|
| `notifications` | Achievement toasts, daily reset notifications |
| `catches` | Catch confirmation updates |
| `user_achievements` | Achievement unlock events |
| `daily_assignments` | Daily task rotation |
| `user_daily_progress` | Daily task completion tracking |
| `user_daily_streaks` | Streak updates |

### Missing from current dev (should be added)

| Table | Purpose |
|---|---|
| `profile_conventions` | Convention join/leave events |
| `fursuit_conventions` | Fursuit convention roster changes |

<details>
<summary>SQL to configure realtime</summary>

```sql
-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.catches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_achievements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_daily_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_daily_streaks;

-- Recommended additions (not yet in dev)
ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_conventions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fursuit_conventions;
```

</details>

---

## 3. Cron / Scheduled Jobs

These pg_cron jobs must be created in each environment. Configure in the Supabase dashboard under **Database > Extensions > pg_cron** or run the SQL below.

| Job Name | Schedule | Command | Purpose |
|---|---|---|---|
| `rotate-dailys-refresh` | `*/5 * * * *` (every 5 min) | `SELECT app_private.rotate_daily_assignments_job()` | Rotate daily tasks per convention timezone |
| `expire-pending-catches` | `*/2 * * * *` (every 2 min) | `SELECT expire_pending_catches()` | Expire stale pending catch confirmations |
| `gameplay-queue-worker` | `10 seconds` | `SELECT public.process_gameplay_queue_if_active()` | Process gameplay event queue |
| `refresh-mv-catches-hourly` | `5 * * * *` (hourly at :05) | `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_catches_hourly` | Refresh catch stats |
| `refresh-mv-convention-daily-stats` | `5 0 * * *` (daily at 00:05) | `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_convention_daily_stats` | Refresh convention stats |
| `refresh-mv-achievement-unlocks-daily` | `10 0 * * *` (daily at 00:10) | `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_achievement_unlocks_daily` | Refresh achievement stats |
| `purge_geo_verification_data` | `0 9 * * *` (daily at 09:00) | `SELECT purge_geo_verification_data()` | Clean up old geo verification data |

<details>
<summary>SQL to create cron jobs</summary>

```sql
SELECT cron.schedule('rotate-dailys-refresh',                '*/5 * * * *',  $$SELECT app_private.rotate_daily_assignments_job()$$);
SELECT cron.schedule('expire-pending-catches',               '*/2 * * * *',  $$SELECT expire_pending_catches()$$);
SELECT cron.schedule('gameplay-queue-worker',                 '10 seconds',   $$SELECT public.process_gameplay_queue_if_active()$$);
SELECT cron.schedule('refresh-mv-catches-hourly',            '5 * * * *',    $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_catches_hourly$$);
SELECT cron.schedule('refresh-mv-convention-daily-stats',    '5 0 * * *',    $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_convention_daily_stats$$);
SELECT cron.schedule('refresh-mv-achievement-unlocks-daily', '10 0 * * *',   $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_achievement_unlocks_daily$$);
SELECT cron.schedule('purge_geo_verification_data',          '0 9 * * *',    $$SELECT purge_geo_verification_data()$$);
```

</details>

---

## 4. Edge Function Secrets (Vault)

The following secrets must be set in each environment's Supabase Vault. Set them in the dashboard under **Project Settings > Edge Functions** or **Database > Vault**.

| Secret Name | Purpose | Notes |
|---|---|---|
| `SERVICE_ROLE_KEY` | Service role JWT for edge functions | Unique per project |
| `SUPABASE_URL` | Project URL for internal calls | Unique per project |
| `project_url` | Project URL (legacy alias) | Same as SUPABASE_URL |
| `send_push_service_role_jwt` | Service role JWT for push notifications | Same as SERVICE_ROLE_KEY |
| `rotate_dailys_service_role_key` | Service role JWT for daily rotation | Same as SERVICE_ROLE_KEY |
| `achievements_processor_secret` | Shared secret for achievement webhook auth | Generate a unique value per environment |
| `ACHIEVEMENTS_PROCESSOR_URL` | URL of the achievement processor function | `https://<project-ref>.supabase.co/functions/v1/process-gameplay-queue` |
| `ACHIEVEMENTS_WEBHOOK_SECRET` | Webhook verification secret | Should match `achievements_processor_secret` |

> **Tip:** For `SERVICE_ROLE_KEY`, `SUPABASE_URL`, and `project_url`, use the values from the project's API settings page. The achievement secrets should be generated fresh for each environment.

---

## 5. Auth Provider Configuration

Configure in the Supabase dashboard under **Authentication > Providers**.

### Email (all environments)

- **Enable Email provider**: Yes
- **Confirm email**: Yes (production), optional for staging
- **Secure email change**: Yes
- **Enable leaked password protection**: Yes (recommended)

### Apple Sign In (production only, optional for staging)

- **Enable Apple provider**: Yes
- **Service ID**: *(from Apple Developer account)*
- **Team ID**: *(from Apple Developer account)*
- **Key ID**: *(from Apple Developer account)*
- **Private Key**: *(from Apple Developer account)*

### Auth URL Configuration

- **Site URL**: Set to the appropriate deep link or app scheme per environment
- **Redirect URLs**: Add environment-specific allowed redirect URLs

---

## 6. Environment-Specific App Configuration

These are configured in `eas.json` and `app.config.ts`:

| Setting | Dev | Staging | Production |
|---|---|---|---|
| Supabase URL | `rtxbvjicfxgcouufumce` | *staging project ref* | *production project ref* |
| Supabase Anon Key | dev key | staging key | production key |
| Supabase Image Transformations | Disabled | Disabled | Disabled |
| Sentry DSN | shared | shared | shared (tagged by env) |
| App Bundle ID | `com.tailtag.app.dev` | `com.tailtag.app.staging` | `com.tailtag.app` |
| EAS Build Profile | `development` | `staging` | `production` |

Supabase Storage Image Transformations are disabled through
`EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORMS_ENABLED=false` until the planned CDN/R2
or generated-thumbnail migration replaces the temporary direct-object delivery
path.

---

## Quick Setup Checklist

When provisioning a new environment, complete these in order:

1. [ ] Create Supabase project
2. [ ] Apply baseline migration (`supabase db push`)
3. [ ] Run `reference.sql` seed
4. [ ] Run `staging-fixtures.sql` seed (staging/dev only)
5. [ ] Create storage buckets and policies (Section 1)
6. [ ] Configure realtime publications (Section 2)
7. [ ] Create cron jobs (Section 3)
8. [ ] Set edge function secrets in Vault (Section 4)
9. [ ] Configure auth providers (Section 5)
10. [ ] Deploy edge functions (`supabase functions deploy <name>`)
11. [ ] Verify cron jobs are running
12. [ ] Test a login + basic app flow
