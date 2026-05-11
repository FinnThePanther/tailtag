-- Keep convention leaderboards and roster visible for three full local days
-- after catching ends. Catching remains gated by is_convention_joinable().

create or replace function public.is_convention_leaderboard_visible(p_convention_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select
      c.status = 'live'
      and (c.start_date is null or info.local_day >= c.start_date)
      and (c.end_date is null or info.local_day <= c.end_date + 3)
    from public.conventions c
    cross join lateral (
      select timezone(coalesce(nullif(c.timezone, ''), 'UTC'), now())::date as local_day
    ) info
    where c.id = p_convention_id
  ), false);
$$;

grant execute on function public.is_convention_leaderboard_visible(uuid)
  to anon, authenticated, service_role;

create or replace function public.get_my_convention_memberships()
returns table (
  convention_id uuid,
  id uuid,
  slug text,
  name text,
  location text,
  start_date date,
  end_date date,
  timezone text,
  latitude numeric,
  longitude numeric,
  geofence_radius_meters integer,
  geofence_enabled boolean,
  location_verification_required boolean,
  status text,
  local_day date,
  is_joinable boolean,
  joined_at timestamp with time zone,
  verification_method text,
  verified_at timestamp with time zone,
  override_at timestamp with time zone,
  playable_notified_at timestamp with time zone,
  membership_state text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    pc.convention_id,
    c.id,
    c.slug,
    c.name,
    c.location,
    c.start_date,
    c.end_date,
    coalesce(nullif(c.timezone, ''), 'UTC') as timezone,
    c.latitude,
    c.longitude,
    c.geofence_radius_meters,
    coalesce(c.geofence_enabled, false) as geofence_enabled,
    coalesce(c.location_verification_required, false) as location_verification_required,
    c.status,
    info.local_day,
    public.is_convention_joinable(c.id) as is_joinable,
    pc.created_at as joined_at,
    pc.verification_method,
    pc.verified_at,
    pc.override_at,
    pc.playable_notified_at,
    case
      when c.status in ('closed', 'archived', 'canceled')
        or (c.end_date is not null and info.local_day > c.end_date + 3)
        then 'past'
      when c.start_date is not null and info.local_day < c.start_date
        then 'upcoming'
      when c.status = 'scheduled'
        then 'awaiting_start'
      when public.is_convention_joinable(c.id)
        and coalesce(c.location_verification_required, false)
        and not public.is_profile_convention_gameplay_eligible(pc.profile_id, c.id)
        then 'needs_location_verification'
      when public.is_profile_convention_gameplay_eligible(pc.profile_id, c.id)
        then 'active'
      when public.is_convention_leaderboard_visible(c.id)
        then 'leaderboard_open'
      else 'awaiting_start'
    end as membership_state
  from public.profile_conventions pc
  join public.conventions c on c.id = pc.convention_id
  cross join lateral (
    select timezone(coalesce(nullif(c.timezone, ''), 'UTC'), now())::date as local_day
  ) info
  where pc.profile_id = auth.uid()
  order by
    case
      when public.is_profile_convention_gameplay_eligible(pc.profile_id, c.id) then 0
      when public.is_convention_leaderboard_visible(c.id) then 1
      when c.status in ('closed', 'archived', 'canceled')
        or (c.end_date is not null and info.local_day > c.end_date + 3) then 3
      else 2
    end,
    c.start_date asc nulls last,
    pc.created_at desc;
$$;

create or replace function app_private.convention_lifecycle_automation_job()
returns void
language plpgsql
security definer
set search_path to 'app_private', 'public', 'extensions'
as $$
declare
  v_supabase_url text;
  v_service_role_key text;
  v_closeout_url text;
  v_headers jsonb;
  convention record;
begin
  select decrypted_secret
    into v_supabase_url
    from vault.decrypted_secrets
   where name = 'SUPABASE_URL'
   order by created_at desc
   limit 1;

  select decrypted_secret
    into v_service_role_key
    from vault.decrypted_secrets
   where name in ('closeout_service_role_key', 'SERVICE_ROLE_KEY', 'rotate_dailys_service_role_key')
   order by
     case name
       when 'closeout_service_role_key' then 1
       when 'SERVICE_ROLE_KEY' then 2
       else 3
     end,
     created_at desc
   limit 1;

  if v_supabase_url is null or v_supabase_url = '' then
    raise warning 'convention_lifecycle_automation_job: missing vault secret SUPABASE_URL';
    return;
  end if;

  if v_service_role_key is null or v_service_role_key = '' then
    raise warning 'convention_lifecycle_automation_job: missing service role vault secret';
    return;
  end if;

  v_closeout_url := rtrim(v_supabase_url, '/') || '/functions/v1/close-out-convention';
  v_headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || v_service_role_key
  );

  for convention in
    select
      c.id,
      'cron_close'::text as source
    from public.conventions c
    cross join lateral (
      select timezone(coalesce(nullif(c.timezone, ''), 'UTC'), now()) as local_now
    ) info
    where c.status = 'live'
      and c.end_date is not null
      and info.local_now::date > c.end_date + 3
      and info.local_now::time >= time '06:00'
      and not exists (
        select 1
          from public.audit_log al
         where al.entity_type = 'convention'
           and al.entity_id = c.id
           and al.action = 'close_convention_attempt'
           and al.context->>'source' = 'cron_close'
           and al.created_at >= now() - interval '6 hours'
      )

    union all

    select
      c.id,
      'cron_retry'::text as source
    from public.conventions c
    where c.status = 'closed'
      and (c.closeout_error is not null or c.archived_at is null)
      and not exists (
        select 1
          from public.audit_log al
         where al.entity_type = 'convention'
           and al.entity_id = c.id
           and al.action = 'close_convention_attempt'
           and al.context->>'source' = 'cron_retry'
           and al.created_at >= now() - interval '6 hours'
      )
      and (
        select count(*)
          from public.audit_log al
         where al.entity_type = 'convention'
           and al.entity_id = c.id
           and al.action = 'close_convention_attempt'
           and al.context->>'source' = 'cron_retry'
           and al.created_at >= now() - interval '7 days'
      ) < 5
  loop
    begin
      perform net.http_post(
        url                  := v_closeout_url,
        headers              := v_headers,
        body                 := jsonb_build_object(
          'convention_id', convention.id::text,
          'source', convention.source
        ),
        timeout_milliseconds := 10000
      );
    exception
      when others then
        raise warning 'convention lifecycle automation failed for convention %: %', convention.id, sqlerrm;
    end;
  end loop;
end;
$$;
