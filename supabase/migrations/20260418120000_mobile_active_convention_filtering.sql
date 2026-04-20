-- Phase 4 convention lifecycle enforcement for player-facing active flows.
--
-- A joinable convention is live and inside its local date window. Scheduled
-- conventions never become joinable automatically; admins must explicitly
-- start them.

create or replace function public.is_convention_joinable(p_convention_id uuid)
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
      and (c.end_date is null or info.local_day <= c.end_date)
    from public.conventions c
    cross join lateral (
      select timezone(coalesce(nullif(c.timezone, ''), 'UTC'), now())::date as local_day
    ) info
    where c.id = p_convention_id
  ), false);
$$;

create or replace function public.get_joinable_conventions()
returns table (
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
  is_joinable boolean
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select
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
    true as is_joinable
  from public.conventions c
  cross join lateral (
    select timezone(coalesce(nullif(c.timezone, ''), 'UTC'), now())::date as local_day
  ) info
  where c.status = 'live'
    and (c.start_date is null or info.local_day >= c.start_date)
    and (c.end_date is null or info.local_day <= c.end_date)
  order by c.start_date asc nulls last, c.name asc;
$$;

create or replace function public.get_active_profile_convention_ids(p_profile_id uuid)
returns table (convention_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select pc.convention_id
  from public.profile_conventions pc
  join public.conventions c on c.id = pc.convention_id
  cross join lateral (
    select timezone(coalesce(nullif(c.timezone, ''), 'UTC'), now())::date as local_day
  ) info
  where pc.profile_id = p_profile_id
    and c.status = 'live'
    and (c.start_date is null or info.local_day >= c.start_date)
    and (c.end_date is null or info.local_day <= c.end_date)
  order by pc.created_at desc;
$$;

create or replace function public.get_active_shared_convention_ids(
  p_profile_id uuid,
  p_fursuit_id uuid
)
returns table (convention_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select pc.convention_id
  from public.profile_conventions pc
  join public.fursuit_conventions fc
    on fc.convention_id = pc.convention_id
   and fc.fursuit_id = p_fursuit_id
  join public.conventions c on c.id = pc.convention_id
  cross join lateral (
    select timezone(coalesce(nullif(c.timezone, ''), 'UTC'), now())::date as local_day
  ) info
  where pc.profile_id = p_profile_id
    and c.status = 'live'
    and (c.start_date is null or info.local_day >= c.start_date)
    and (c.end_date is null or info.local_day <= c.end_date)
  order by pc.created_at desc;
$$;

create or replace function public.opt_in_to_convention(
  p_profile_id uuid,
  p_convention_id uuid,
  p_verified_location jsonb default null::jsonb,
  p_verification_method text default 'none'::text,
  p_override_reason text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_convention record;
  v_verification jsonb;
  v_method text := coalesce(p_verification_method, 'none');
begin
  select *
    into v_convention
    from public.conventions
   where id = p_convention_id;

  if not found then
    raise exception 'Convention not found';
  end if;

  if not public.is_convention_joinable(p_convention_id) then
    raise exception 'Convention is not live';
  end if;

  -- Enforce verification server-side; never trust client-only gating.
  if v_convention.location_verification_required then
    if not v_convention.geofence_enabled or v_convention.latitude is null or v_convention.longitude is null then
      raise exception 'Convention geofence not configured';
    end if;

    if v_method = 'manual_override' then
      if p_override_reason is null then
        raise exception 'Override reason required';
      end if;
    else
      if p_verified_location is null then
        raise exception 'Location verification required';
      end if;

      v_verification := public.verify_convention_location(
        p_profile_id,
        p_convention_id,
        (p_verified_location->>'lat')::double precision,
        (p_verified_location->>'lng')::double precision,
        coalesce((p_verified_location->>'accuracy')::integer, 0)
      );

      if (v_verification->>'verified')::boolean is distinct from true then
        raise exception 'Location verification failed: %', coalesce(v_verification->>'error', 'unknown');
      end if;

      v_method := 'gps';
    end if;
  else
    if p_verified_location is not null then
      v_method := 'gps';
    end if;
  end if;

  insert into public.profile_conventions (
    profile_id,
    convention_id,
    verified_location,
    verification_method,
    verified_at,
    override_actor_id,
    override_reason,
    override_at,
    created_at
  )
  values (
    p_profile_id,
    p_convention_id,
    p_verified_location,
    v_method,
    case when v_method = 'gps' then now() else null end,
    case when v_method = 'manual_override' then auth.uid() else null end,
    case when v_method = 'manual_override' then p_override_reason else null end,
    case when v_method = 'manual_override' then now() else null end,
    now()
  )
  on conflict (profile_id, convention_id) do update
  set
    verified_location = excluded.verified_location,
    verification_method = excluded.verification_method,
    verified_at = excluded.verified_at,
    override_actor_id = excluded.override_actor_id,
    override_reason = excluded.override_reason,
    override_at = excluded.override_at;
end;
$$;

create or replace function public.enforce_joinable_fursuit_convention()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner_id uuid;
begin
  select f.owner_id
    into v_owner_id
    from public.fursuits f
   where f.id = new.fursuit_id;

  if v_owner_id is null then
    raise exception 'Fursuit not found';
  end if;

  if not public.is_convention_joinable(new.convention_id) then
    raise exception 'Convention is not live';
  end if;

  if not exists (
    select 1
      from public.profile_conventions pc
     where pc.profile_id = v_owner_id
       and pc.convention_id = new.convention_id
  ) then
    raise exception 'Fursuit owner must join the live convention before assigning this fursuit';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_joinable_fursuit_convention_trigger on public.fursuit_conventions;

create trigger enforce_joinable_fursuit_convention_trigger
  before insert or update of fursuit_id, convention_id
  on public.fursuit_conventions
  for each row
  execute function public.enforce_joinable_fursuit_convention();

create or replace function public.create_catch_with_approval(
  p_fursuit_id uuid,
  p_catcher_id uuid,
  p_convention_id uuid default null::uuid,
  p_is_tutorial boolean default false,
  p_force_pending boolean default false
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fursuit_mode text;
  v_fursuit_owner_id uuid;
  v_catch_status text;
  v_expires_at timestamptz;
  v_catch_id uuid;
  v_catch_number integer;
  v_result json;
begin
  select catch_mode, owner_id
    into v_fursuit_mode, v_fursuit_owner_id
    from public.fursuits
   where id = p_fursuit_id;

  if not found then
    raise exception 'Fursuit not found';
  end if;

  if v_fursuit_owner_id = p_catcher_id then
    raise exception 'Cannot catch your own fursuit';
  end if;

  if p_convention_id is not null then
    if not public.is_convention_joinable(p_convention_id) then
      raise exception 'Convention is not live';
    end if;

    if not exists (
      select 1
        from public.profile_conventions pc
       where pc.profile_id = p_catcher_id
         and pc.convention_id = p_convention_id
    ) then
      raise exception 'Catcher must join the live convention before catching';
    end if;

    if not exists (
      select 1
        from public.fursuit_conventions fc
       where fc.fursuit_id = p_fursuit_id
         and fc.convention_id = p_convention_id
    ) then
      raise exception 'Fursuit must be assigned to the live convention before it can be caught there';
    end if;

    if exists (
      select 1
        from public.catches
       where fursuit_id = p_fursuit_id
         and catcher_id = p_catcher_id
         and convention_id = p_convention_id
         and status in ('ACCEPTED', 'PENDING')
    ) then
      raise exception 'Fursuit already caught at this convention';
    end if;
  else
    if exists (
      select 1
        from public.catches
       where fursuit_id = p_fursuit_id
         and catcher_id = p_catcher_id
         and convention_id is null
         and status in ('ACCEPTED', 'PENDING')
    ) then
      raise exception 'Fursuit already caught or pending';
    end if;
  end if;

  if (v_fursuit_mode = 'MANUAL_APPROVAL' or p_force_pending) and not p_is_tutorial then
    v_catch_status := 'PENDING';
    if p_convention_id is not null then
      v_expires_at := public.calculate_catch_expiration(p_convention_id);
    else
      v_expires_at := public.calculate_catch_expiration();
    end if;
  else
    v_catch_status := 'ACCEPTED';
    v_expires_at := null;
  end if;

  insert into public.catches (
    fursuit_id,
    catcher_id,
    convention_id,
    is_tutorial,
    status,
    expires_at,
    caught_at
  )
  values (
    p_fursuit_id,
    p_catcher_id,
    p_convention_id,
    p_is_tutorial,
    v_catch_status,
    v_expires_at,
    now()
  )
  returning id, catch_number into v_catch_id, v_catch_number;

  select json_build_object(
    'catch_id', v_catch_id,
    'status', v_catch_status,
    'expires_at', v_expires_at,
    'catch_number', v_catch_number,
    'requires_approval', v_catch_status = 'PENDING',
    'fursuit_owner_id', v_fursuit_owner_id
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.is_convention_joinable(uuid) to anon, authenticated, service_role;
grant execute on function public.get_joinable_conventions() to anon, authenticated, service_role;
grant execute on function public.get_active_profile_convention_ids(uuid) to authenticated, service_role;
grant execute on function public.get_active_shared_convention_ids(uuid, uuid) to authenticated, service_role;
