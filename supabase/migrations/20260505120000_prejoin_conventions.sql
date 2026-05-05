-- Support pre-joining scheduled conventions while keeping gameplay gated to
-- live conventions inside their local date window.

alter table public.profile_conventions
  add column if not exists playable_notified_at timestamp with time zone;

drop index if exists public.profile_conventions_profile_id_unique;

create index if not exists profile_conventions_profile_created_idx
  on public.profile_conventions (profile_id, created_at desc);

create index if not exists profile_conventions_convention_notified_idx
  on public.profile_conventions (convention_id, playable_notified_at);

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

create or replace function public.is_convention_prejoinable(p_convention_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select
      c.status in ('scheduled', 'live')
      and (c.end_date is null or info.local_day <= c.end_date)
    from public.conventions c
    cross join lateral (
      select timezone(coalesce(nullif(c.timezone, ''), 'UTC'), now())::date as local_day
    ) info
    where c.id = p_convention_id
  ), false);
$$;

create or replace function public.is_profile_convention_gameplay_eligible(
  p_profile_id uuid,
  p_convention_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.profile_conventions pc
    join public.conventions c on c.id = pc.convention_id
    where pc.profile_id = p_profile_id
      and pc.convention_id = p_convention_id
      and public.is_convention_joinable(pc.convention_id)
      and (
        coalesce(c.location_verification_required, false) = false
        or pc.verification_method = 'grandfathered'
        or (pc.verification_method = 'manual_override' and pc.override_at is not null)
        or (pc.verification_method = 'gps' and pc.verified_at is not null)
      )
  );
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
    public.is_convention_joinable(c.id) as is_joinable
  from public.conventions c
  cross join lateral (
    select timezone(coalesce(nullif(c.timezone, ''), 'UTC'), now())::date as local_day
  ) info
  where public.is_convention_prejoinable(c.id)
  order by
    case when public.is_convention_joinable(c.id) then 0 else 1 end,
    c.start_date asc nulls last,
    c.name asc;
$$;

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
        or (c.end_date is not null and info.local_day > c.end_date)
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
      when c.status in ('closed', 'archived', 'canceled')
        or (c.end_date is not null and info.local_day > c.end_date) then 3
      else 1
    end,
    c.start_date asc nulls last,
    pc.created_at desc;
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
  where pc.profile_id = p_profile_id
    and public.is_profile_convention_gameplay_eligible(pc.profile_id, pc.convention_id)
  order by c.start_date asc nulls last, pc.created_at desc;
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
  join public.fursuits f on f.id = fc.fursuit_id
  join public.conventions c on c.id = pc.convention_id
  where pc.profile_id = p_profile_id
    and public.is_profile_convention_gameplay_eligible(p_profile_id, pc.convention_id)
    and public.is_profile_convention_gameplay_eligible(f.owner_id, pc.convention_id)
  order by c.start_date asc nulls last, pc.created_at desc;
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
  v_actor_id uuid := auth.uid();
  v_actor_is_admin boolean := auth.role() = 'service_role';
  v_convention record;
  v_verification jsonb;
  v_method text := coalesce(p_verification_method, 'none');
  v_requires_live_verification boolean := false;
begin
  if not v_actor_is_admin then
    v_actor_is_admin := coalesce(public.is_admin(v_actor_id), false);
  end if;

  if auth.role() <> 'service_role' and v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and v_actor_id is distinct from p_profile_id and not v_actor_is_admin then
    raise exception 'Not authorized to join conventions for this profile';
  end if;

  if v_method in ('manual_override', 'grandfathered') and not v_actor_is_admin then
    raise exception 'Admin privileges required for this verification method';
  end if;

  select *
    into v_convention
    from public.conventions
   where id = p_convention_id;

  if not found then
    raise exception 'Convention not found';
  end if;

  if not public.is_convention_prejoinable(p_convention_id) then
    raise exception 'Convention is not open for registration';
  end if;

  v_requires_live_verification :=
    public.is_convention_joinable(p_convention_id)
    and coalesce(v_convention.location_verification_required, false);

  if v_requires_live_verification then
    if not v_convention.geofence_enabled or v_convention.latitude is null or v_convention.longitude is null then
      raise exception 'Convention geofence not configured';
    end if;

    if v_method in ('manual_override', 'grandfathered') then
      if v_method = 'manual_override' and p_override_reason is null then
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
    elsif v_method not in ('manual_override', 'grandfathered') then
      v_method := 'none';
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

  if not public.is_convention_prejoinable(new.convention_id) then
    raise exception 'Convention is not open for registration';
  end if;

  if not exists (
    select 1
      from public.profile_conventions pc
     where pc.profile_id = v_owner_id
       and pc.convention_id = new.convention_id
  ) then
    raise exception 'Fursuit owner must join the convention before assigning this fursuit';
  end if;

  return new;
end;
$$;

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
  v_owner_catch_mode text;
  v_fursuit_owner_id uuid;
  v_catch_status text;
  v_expires_at timestamptz;
  v_catch_id uuid;
  v_catch_number integer;
  v_result json;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_catcher_id then
    raise exception 'Catcher must match the authenticated user';
  end if;

  select
    coalesce(p.default_catch_mode, 'AUTO_ACCEPT'),
    f.owner_id
  into
    v_owner_catch_mode,
    v_fursuit_owner_id
  from public.fursuits f
  left join public.profiles p on p.id = f.owner_id
  where f.id = p_fursuit_id;

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

    if not public.is_profile_convention_gameplay_eligible(p_catcher_id, p_convention_id) then
      raise exception 'Catcher must join the live convention before catching';
    end if;

    if not public.is_profile_convention_gameplay_eligible(v_fursuit_owner_id, p_convention_id) then
      raise exception 'Fursuit owner must join the live convention before catching';
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

  if (v_owner_catch_mode = 'MANUAL_APPROVAL' or p_force_pending) and not p_is_tutorial then
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

  begin
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
  exception
    when unique_violation then
      if p_convention_id is not null then
        raise exception 'Fursuit already caught at this convention';
      end if;

      raise exception 'Fursuit already caught or pending';
  end;

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

grant execute on function public.is_convention_prejoinable(uuid) to anon, authenticated, service_role;
grant execute on function public.is_profile_convention_gameplay_eligible(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_my_convention_memberships() to authenticated, service_role;
