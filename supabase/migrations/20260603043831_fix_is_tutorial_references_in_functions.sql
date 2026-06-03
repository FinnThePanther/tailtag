-- Fix functions that still reference the dropped is_tutorial columns
-- on catches and fursuits tables.

-- 1. get_catch_detail: remove c.is_tutorial = false filter
drop function if exists public.get_catch_detail(uuid);
create or replace function public.get_catch_detail(p_catch_id uuid)
returns table(catch_id uuid, caught_at timestamp with time zone, convention_id uuid, catch_number integer, catch_photo_path text, catch_photo_url text, convention jsonb, fursuit_id uuid, fursuit_redacted boolean, fursuit_owner_id uuid, fursuit_name text, species_id uuid, species_name text, fursuit_avatar_path text, fursuit_avatar_url text, fursuit_description text, fursuit_unique_code text, fursuit_visibility_audience text, fursuit_catch_count integer, fursuit_created_at timestamp with time zone, color_assignments jsonb, fursuit_bio jsonb, owner_social_links jsonb, makers jsonb)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with viewer as (
    select auth.uid() as id
  ),
  visible_catches as (
    select
      c.*,
      public.can_view_fursuit_as_profile((select id from viewer), c.fursuit_id) as can_view_fursuit
    from public.catches c
    join public.fursuits f on f.id = c.fursuit_id
    where c.id = p_catch_id
      and c.status = 'ACCEPTED'
      and (
        c.catcher_id = (select id from viewer)
        or f.owner_id = (select id from viewer)
        or public.is_elevated_privacy_viewer((select id from viewer))
      )
  )
  select
    c.id,
    c.caught_at,
    c.convention_id,
    c.catch_number,
    case when c.can_view_fursuit then c.catch_photo_path else null end,
    case when c.can_view_fursuit then c.catch_photo_url else null end,
    case
      when conv.id is null then null
      else jsonb_build_object(
        'id', conv.id,
        'name', conv.name,
        'location', conv.location,
        'start_date', conv.start_date,
        'end_date', conv.end_date,
        'status', conv.status
      )
    end,
    c.fursuit_id,
    not c.can_view_fursuit,
    case when c.can_view_fursuit then f.owner_id else null end,
    case when c.can_view_fursuit then f.name else 'Unavailable fursuit' end,
    case when c.can_view_fursuit then f.species_id else null end,
    case when c.can_view_fursuit then fs.name else null end,
    case when c.can_view_fursuit then f.avatar_path else null end,
    case when c.can_view_fursuit then f.avatar_url else null end,
    case when c.can_view_fursuit then f.description else null end,
    case
      when c.can_view_fursuit and f.owner_id = (select id from viewer) then f.unique_code
      else null
    end,
    case when c.can_view_fursuit then f.visibility_audience else 'everyone' end,
    case when c.can_view_fursuit then coalesce(f.catch_count, 0) else 0 end,
    case when c.can_view_fursuit then f.created_at else null end,
    case when c.can_view_fursuit then coalesce(colors.data, '[]'::jsonb) else '[]'::jsonb end,
    case when c.can_view_fursuit then bio.data else null end,
    case when c.can_view_fursuit then coalesce(owner_profile.social_links, '[]'::jsonb) else '[]'::jsonb end,
    case when c.can_view_fursuit then coalesce(makers.data, '[]'::jsonb) else '[]'::jsonb end
  from visible_catches c
  left join public.fursuits f on f.id = c.fursuit_id
  left join public.fursuit_species fs on fs.id = f.species_id
  left join public.profiles owner_profile on owner_profile.id = f.owner_id
  left join public.conventions conv on conv.id = c.convention_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'position', fca.position,
        'color', jsonb_build_object(
          'id', fc.id,
          'name', fc.name,
          'normalized_name', fc.normalized_name
        )
      )
      order by fca.position
    ) as data
    from public.fursuit_color_assignments fca
    join public.fursuit_colors fc on fc.id = fca.color_id
    where fca.fursuit_id = f.id
  ) colors on true
  left join lateral (
    select to_jsonb(fb.*) as data
    from public.fursuit_bios fb
    where fb.fursuit_id = f.id
    order by fb.version desc
    limit 1
  ) bio on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', fm.id,
        'maker_name', fm.maker_name,
        'normalized_maker_name', fm.normalized_maker_name,
        'position', fm.position
      )
      order by fm.position
    ) as data
    from public.fursuit_makers fm
    where fm.fursuit_id = f.id
  ) makers on true;
$$;

-- 2. get_convention_leaderboard: remove c.is_tutorial = false filter
drop function if exists public.get_convention_leaderboard(uuid);
create or replace function public.get_convention_leaderboard(p_convention_id uuid default null::uuid)
returns table(catcher_id uuid, convention_id uuid, username text, catch_count bigint, unique_fursuits bigint, unique_species bigint, last_catch_at timestamp with time zone, first_catch_at timestamp with time zone, profile_redacted boolean)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with auth_context as (
    select auth.uid() as id
  ),
  leaderboard as (
    select
      c.catcher_id,
      c.convention_id,
      count(*) as catch_count,
      count(distinct c.fursuit_id) as unique_fursuits,
      count(distinct f.species_id) as unique_species,
      max(c.caught_at) as last_catch_at,
      min(c.caught_at) as first_catch_at
    from public.catches c
    join public.fursuits f on f.id = c.fursuit_id
    cross join auth_context cu
    where cu.id is not null
      and c.status = 'ACCEPTED'
      and (p_convention_id is null or c.convention_id = p_convention_id)
    group by c.catcher_id, c.convention_id
  )
  select
    l.catcher_id,
    l.convention_id,
    case
      when public.can_view_profile(cu.id, l.catcher_id) then p.username
      else null
    end as username,
    l.catch_count,
    l.unique_fursuits,
    l.unique_species,
    l.last_catch_at,
    l.first_catch_at,
    not public.can_view_profile(cu.id, l.catcher_id) as profile_redacted
  from leaderboard l
  join public.profiles p on p.id = l.catcher_id
  cross join auth_context cu
  order by l.catch_count desc, profile_redacted asc, l.catcher_id asc;
$$;

-- 3. get_convention_suit_roster_caught_ids: remove c.is_tutorial = false filter
drop function if exists public.get_convention_suit_roster_caught_ids(uuid);
create or replace function public.get_convention_suit_roster_caught_ids(p_convention_id uuid)
returns table(fursuit_id uuid)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select distinct c.fursuit_id
  from public.catches c
  where auth.uid() is not null
    and c.convention_id = p_convention_id
    and c.catcher_id = auth.uid()
    and c.status = 'ACCEPTED'
  order by c.fursuit_id asc;
$$;

-- 4. get_fursuit_catches: remove c.is_tutorial = false filter
drop function if exists public.get_fursuit_catches(uuid);
create or replace function public.get_fursuit_catches(p_fursuit_id uuid)
returns table(catch_id uuid, caught_at timestamp with time zone, catch_photo_path text, catch_photo_url text, is_redacted boolean)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with viewer as (
    select auth.uid() as id
  ),
  visible_catches as (
    select
      c.*,
      public.can_view_fursuit_as_profile((select id from viewer), c.fursuit_id) as can_view_fursuit,
      public.can_view_profile_as_profile((select id from viewer), c.catcher_id) as can_view_catcher
    from public.catches c
    where c.fursuit_id = p_fursuit_id
      and c.status = 'ACCEPTED'
  )
  select
    c.id,
    c.caught_at,
    case
      when c.can_view_fursuit and c.can_view_catcher
        then c.catch_photo_path
      else null
    end as catch_photo_path,
    case
      when c.can_view_fursuit and c.can_view_catcher
        then c.catch_photo_url
      else null
    end as catch_photo_url,
    not (c.can_view_fursuit and c.can_view_catcher) as is_redacted
  from visible_catches c
  where c.can_view_fursuit
  order by c.caught_at desc nulls last, c.id desc;
$$;

-- 5. get_my_caught_suits: remove c.is_tutorial = false filter
drop function if exists public.get_my_caught_suits();
create or replace function public.get_my_caught_suits()
returns table(catch_id uuid, caught_at timestamp with time zone, convention_id uuid, catch_number integer, catch_photo_path text, catch_photo_url text, convention jsonb, fursuit_id uuid, fursuit_redacted boolean, fursuit_owner_id uuid, fursuit_name text, species_id uuid, species_name text, fursuit_avatar_path text, fursuit_avatar_url text, fursuit_description text, fursuit_unique_code text, fursuit_visibility_audience text, fursuit_catch_count integer, fursuit_created_at timestamp with time zone, color_assignments jsonb, fursuit_bio jsonb, owner_social_links jsonb, makers jsonb)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with viewer as (
    select auth.uid() as id
  ),
  visible_catches as (
    select
      c.*,
      public.can_view_fursuit_as_profile((select id from viewer), c.fursuit_id) as can_view_fursuit
    from public.catches c
    where c.catcher_id = (select id from viewer)
      and c.status = 'ACCEPTED'
  )
  select
    c.id as catch_id,
    c.caught_at,
    c.convention_id,
    c.catch_number,
    case when c.can_view_fursuit then c.catch_photo_path else null end as catch_photo_path,
    case when c.can_view_fursuit then c.catch_photo_url else null end as catch_photo_url,
    case
      when conv.id is null then null
      else jsonb_build_object(
        'id', conv.id,
        'name', conv.name,
        'location', conv.location,
        'start_date', conv.start_date,
        'end_date', conv.end_date,
        'status', conv.status
      )
    end as convention,
    c.fursuit_id,
    not c.can_view_fursuit as fursuit_redacted,
    case when c.can_view_fursuit then f.owner_id else null end as fursuit_owner_id,
    case when c.can_view_fursuit then f.name else 'Unavailable fursuit' end as fursuit_name,
    case when c.can_view_fursuit then f.species_id else null end as species_id,
    case when c.can_view_fursuit then fs.name else null end as species_name,
    case when c.can_view_fursuit then f.avatar_path else null end as fursuit_avatar_path,
    case when c.can_view_fursuit then f.avatar_url else null end as fursuit_avatar_url,
    case when c.can_view_fursuit then f.description else null end as fursuit_description,
    case
      when c.can_view_fursuit and f.owner_id = (select id from viewer) then f.unique_code
      else null
    end as fursuit_unique_code,
    case when c.can_view_fursuit then f.visibility_audience else 'everyone' end as fursuit_visibility_audience,
    case when c.can_view_fursuit then coalesce(f.catch_count, 0) else 0 end as fursuit_catch_count,
    case when c.can_view_fursuit then f.created_at else null end as fursuit_created_at,
    case
      when c.can_view_fursuit then coalesce(colors.data, '[]'::jsonb)
      else '[]'::jsonb
    end as color_assignments,
    case when c.can_view_fursuit then bio.data else null end as fursuit_bio,
    case
      when c.can_view_fursuit then coalesce(owner_profile.social_links, '[]'::jsonb)
      else '[]'::jsonb
    end as owner_social_links,
    case
      when c.can_view_fursuit then coalesce(makers.data, '[]'::jsonb)
      else '[]'::jsonb
    end as makers
  from visible_catches c
  left join public.fursuits f on f.id = c.fursuit_id
  left join public.fursuit_species fs on fs.id = f.species_id
  left join public.profiles owner_profile on owner_profile.id = f.owner_id
  left join public.conventions conv on conv.id = c.convention_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'position', fca.position,
        'color', jsonb_build_object(
          'id', fc.id,
          'name', fc.name,
          'normalized_name', fc.normalized_name
        )
      )
      order by fca.position
    ) as data
    from public.fursuit_color_assignments fca
    join public.fursuit_colors fc on fc.id = fca.color_id
    where fca.fursuit_id = f.id
  ) colors on true
  left join lateral (
    select to_jsonb(fb.*) as data
    from public.fursuit_bios fb
    where fb.fursuit_id = f.id
    order by fb.version desc
    limit 1
  ) bio on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', fm.id,
        'maker_name', fm.maker_name,
        'normalized_maker_name', fm.normalized_maker_name,
        'position', fm.position
      )
      order by fm.position
    ) as data
    from public.fursuit_makers fm
    where fm.fursuit_id = f.id
  ) makers on true
  order by c.caught_at desc nulls last, c.id desc;
$$;

-- 6. verify_and_opt_in_to_convention: replace f.is_tutorial = false with is_tutorial_fursuit()
drop function if exists public.verify_and_opt_in_to_convention(uuid, uuid, jsonb);
create or replace function public.verify_and_opt_in_to_convention(p_profile_id uuid, p_convention_id uuid, p_verified_location jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_is_admin boolean := auth.role() = 'service_role';
  v_convention record;
  v_requires_live_verification boolean := false;
  v_verified boolean := false;
  v_error text := null;
  v_error_code text := null;
  v_accuracy integer := coalesce((p_verified_location->>'accuracy')::integer, 0);
  v_was_active_member boolean := false;
  v_distance_meters decimal := null;
  v_effective_radius integer := null;
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

  select *
    into v_convention
    from public.conventions
   where id = p_convention_id;

  if not found then
    return jsonb_build_object(
      'verified', false,
      'requires_location_verification', false,
      'distance_meters', null,
      'geofence_radius_meters', null,
      'effective_radius_meters', null,
      'error_code', 'convention_not_found',
      'error', 'Convention not found'
    );
  end if;

  if not public.is_convention_prejoinable(p_convention_id) then
    return jsonb_build_object(
      'verified', false,
      'requires_location_verification', false,
      'distance_meters', null,
      'geofence_radius_meters', v_convention.geofence_radius_meters,
      'effective_radius_meters', null,
      'error_code', 'registration_closed',
      'error', 'Convention is not open for registration'
    );
  end if;

  select exists (
    select 1
      from public.profile_conventions pc
     where pc.profile_id = p_profile_id
       and pc.convention_id = p_convention_id
       and pc.attendance_state = 'active'
       and pc.active_until is null
  )
  into v_was_active_member;

  v_requires_live_verification :=
    public.is_convention_joinable(p_convention_id)
    and coalesce(v_convention.location_verification_required, false);

  if v_requires_live_verification then
    if not v_convention.geofence_enabled or v_convention.latitude is null or v_convention.longitude is null or v_convention.geofence_radius_meters is null then
      return jsonb_build_object(
        'verified', false,
        'requires_location_verification', true,
        'distance_meters', null,
        'geofence_radius_meters', v_convention.geofence_radius_meters,
        'effective_radius_meters', null,
        'error_code', 'geofence_not_configured',
        'error', 'Convention geofence not configured'
      );
    end if;

    if p_verified_location is null
      or p_verified_location->>'lat' is null
      or p_verified_location->>'lng' is null then
      return jsonb_build_object(
        'verified', false,
        'requires_location_verification', true,
        'distance_meters', null,
        'geofence_radius_meters', v_convention.geofence_radius_meters,
        'effective_radius_meters', null,
        'error_code', 'location_required',
        'error', 'Location verification required'
      );
    end if;

    -- Inline rate-limit check (replaces verify_convention_location's internal check).
    if (
      select count(*)
      from verification_attempts
      where profile_id = p_profile_id
        and created_at > now() - interval '1 hour'
    ) >= 10 then
      insert into verification_attempts (
        profile_id, convention_id, verified, distance_meters, gps_accuracy, error_code
      ) values (
        p_profile_id, p_convention_id, false, null, v_accuracy, 'rate_limited'
      );

      return jsonb_build_object(
        'verified', false,
        'requires_location_verification', true,
        'distance_meters', null,
        'geofence_radius_meters', v_convention.geofence_radius_meters,
        'effective_radius_meters', null,
        'error_code', 'rate_limited',
        'error', 'Rate limit exceeded'
      );
    end if;

    -- Inline distance calculation (replaces verify_convention_location).
    -- City-wide tolerance: radius + accuracy allowance capped to 5km.
    v_effective_radius := v_convention.geofence_radius_meters + least(greatest(v_accuracy, 0), 5000);

    v_distance_meters := extensions.st_distancesphere(
      extensions.st_makepoint(
        (p_verified_location->>'lng')::double precision,
        (p_verified_location->>'lat')::double precision
      ),
      extensions.st_makepoint(v_convention.longitude, v_convention.latitude)
    );

    v_verified := v_distance_meters <= v_effective_radius;
    if not v_verified then
      if v_accuracy > 5000 then
        v_error := 'GPS accuracy too low';
        v_error_code := 'poor_accuracy';
      else
        v_error := 'Outside geofence';
        v_error_code := 'outside_geofence';
      end if;
    end if;

    -- Single audit insert (was doubled by the nested verify_convention_location call).
    insert into verification_attempts (
      profile_id, convention_id, verified, distance_meters, gps_accuracy, error_code
    ) values (
      p_profile_id, p_convention_id, v_verified, v_distance_meters, v_accuracy, v_error_code
    );

    if not v_verified then
      return jsonb_build_object(
        'verified', false,
        'requires_location_verification', true,
        'distance_meters', coalesce(round(v_distance_meters, 2), null),
        'geofence_radius_meters', v_convention.geofence_radius_meters,
        'effective_radius_meters', v_effective_radius,
        'error_code', v_error_code,
        'error', v_error
      );
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
    playable_notified_at,
    attendance_state,
    left_at,
    removed_at,
    active_until,
    finalized_at,
    created_at
  )
  values (
    p_profile_id,
    p_convention_id,
    case when v_requires_live_verification then p_verified_location else null end,
    case when v_requires_live_verification then 'gps' else 'none' end,
    case when v_requires_live_verification then now() else null end,
    null,
    null,
    null,
    null,
    'active',
    null,
    null,
    null,
    null,
    now()
  )
  on conflict (profile_id, convention_id) do update
  set
    verified_location = excluded.verified_location,
    verification_method = excluded.verification_method,
    verified_at = excluded.verified_at,
    override_actor_id = null,
    override_reason = null,
    override_at = null,
    playable_notified_at = null,
    attendance_state = 'active',
    left_at = null,
    removed_at = null,
    active_until = null,
    finalized_at = null;

  if not v_was_active_member then
    insert into public.fursuit_conventions (
      fursuit_id,
      convention_id,
      roster_visible,
      roster_state,
      removed_at,
      active_until,
      finalized_at
    )
    select
      f.id,
      p_convention_id,
      true,
      'active',
      null,
      null,
      null
    from public.fursuits f
    where f.owner_id = p_profile_id
      and not public.is_tutorial_fursuit(f.id)
    on conflict (fursuit_id, convention_id) do update
    set
      roster_visible = true,
      roster_state = 'active',
      removed_at = null,
      active_until = null,
      finalized_at = null;
  end if;

  return jsonb_build_object(
    'verified', true,
    'requires_location_verification', v_requires_live_verification,
    'distance_meters', coalesce(round(v_distance_meters, 2), null),
    'geofence_radius_meters', v_convention.geofence_radius_meters,
    'effective_radius_meters', v_effective_radius,
    'error_code', null,
    'error', null
  );
end;
$$;