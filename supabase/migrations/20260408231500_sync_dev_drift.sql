-- =============================================================================
-- Capture dev drift into migrations
-- =============================================================================
-- This migration restores three things that existed on dev as hand-applied
-- changes but were never captured in version control:
--
--   1. app_private.should_enqueue_gameplay_event(text)
--   2. app_private.rotate_daily_assignments_job()
--      - reworked to read SUPABASE_URL from the vault instead of hardcoding the
--        dev project URL, so the same definition works on every environment.
--   3. The full set of cron jobs the application depends on, scheduled
--      idempotently so the schedules drift back to a known-good state on every
--      deploy.
--
-- Idempotent: safe to run on dev, staging, and production.
-- =============================================================================

-- ── 1. should_enqueue_gameplay_event ────────────────────────────────────────

create or replace function app_private.should_enqueue_gameplay_event(p_type text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select p_type in (
    'catch_performed',
    'profile_updated',
    'onboarding_completed',
    'convention_joined',
    'leaderboard_refreshed',
    'catch_shared',
    'fursuit_bio_viewed'
  );
$$;

-- ── 2. rotate_daily_assignments_job ─────────────────────────────────────────

create or replace function app_private.rotate_daily_assignments_job()
returns void
language plpgsql
security definer
set search_path to 'app_private', 'public', 'extensions'
as $$
declare
  v_supabase_url     text;
  v_service_role_key text;
  v_rotate_url       text;
  v_headers          jsonb;
  convention         record;
begin
  -- Read the project URL from vault so this function works on every environment
  -- without code changes. (The dev version of this function hardcoded the dev
  -- project URL, which is why staging's cron has been silently broken.)
  select decrypted_secret
    into v_supabase_url
    from vault.decrypted_secrets
   where name = 'SUPABASE_URL'
   order by created_at desc
   limit 1;

  if v_supabase_url is null or v_supabase_url = '' then
    raise exception 'Vault secret "SUPABASE_URL" is not set';
  end if;

  select decrypted_secret
    into v_service_role_key
    from vault.decrypted_secrets
   where name = 'rotate_dailys_service_role_key'
   order by created_at desc
   limit 1;

  if v_service_role_key is null or v_service_role_key = '' then
    raise exception 'Vault secret "rotate_dailys_service_role_key" is not set';
  end if;

  v_rotate_url := rtrim(v_supabase_url, '/') || '/functions/v1/rotate-dailys';

  v_headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || v_service_role_key
  );

  for convention in
    select
      c.id,
      info.local_day
    from public.conventions c
    cross join lateral (
      select timezone(coalesce(nullif(c.timezone, ''), 'UTC'), now())::date as local_day
    ) info
    where (c.start_date is null or info.local_day >= c.start_date)
      and (c.end_date is null or info.local_day <= c.end_date)
  loop
    if exists (
      select 1
      from public.daily_assignments da
      where da.convention_id = convention.id
        and da.day = convention.local_day
    ) then
      continue;
    end if;

    begin
      perform net.http_post(
        url                  := v_rotate_url || '?convention_id=' || convention.id::text,
        headers              := v_headers,
        timeout_milliseconds := 10000
      );
    exception
      when others then
        raise warning 'rotate-dailys cron failed for convention %: %', convention.id, sqlerrm;
    end;
  end loop;
end;
$$;

-- ── 3. Cron schedule reconciliation ─────────────────────────────────────────
-- Capture every cron job the application depends on. This block is idempotent:
-- if a job already exists with a different schedule or command, it gets
-- realigned via cron.alter_job; otherwise it's created via cron.schedule.

do $$
declare
  desired jsonb := jsonb_build_array(
    jsonb_build_object(
      'name',     'expire-pending-catches',
      'schedule', '*/2 * * * *',
      'command',  'SELECT expire_pending_catches()'
    ),
    jsonb_build_object(
      'name',     'gameplay-queue-worker',
      'schedule', '* * * * *',
      'command',  'SELECT public.process_gameplay_queue_if_active()'
    ),
    jsonb_build_object(
      'name',     'purge_geo_verification_data',
      'schedule', '0 9 * * *',
      'command',  'SELECT purge_geo_verification_data();'
    ),
    jsonb_build_object(
      'name',     'refresh-mv-achievement-unlocks-daily',
      'schedule', '10 0 * * *',
      'command',  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_achievement_unlocks_daily'
    ),
    jsonb_build_object(
      'name',     'refresh-mv-catches-hourly',
      'schedule', '5 * * * *',
      'command',  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_catches_hourly'
    ),
    jsonb_build_object(
      'name',     'refresh-mv-convention-daily-stats',
      'schedule', '5 0 * * *',
      'command',  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_convention_daily_stats'
    ),
    jsonb_build_object(
      'name',     'rotate-dailys-refresh',
      'schedule', '*/5 * * * *',
      'command',  'select app_private.rotate_daily_assignments_job();'
    )
  );
  v_entry    jsonb;
  v_job_id   bigint;
begin
  for v_entry in select * from jsonb_array_elements(desired)
  loop
    select j.jobid
      into v_job_id
      from cron.job j
     where j.jobname = v_entry->>'name'
     limit 1;

    if v_job_id is not null then
      perform cron.alter_job(
        v_job_id,
        schedule := v_entry->>'schedule',
        command  := v_entry->>'command'
      );
    else
      perform cron.schedule(
        v_entry->>'name',
        v_entry->>'schedule',
        v_entry->>'command'
      );
    end if;
  end loop;
end;
$$;
