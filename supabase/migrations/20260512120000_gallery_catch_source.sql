-- Track photo catch source and allow gallery catches during the existing
-- three-local-day post-convention review window.

alter table public.catches
  add column if not exists catch_photo_source text;

update public.catches
   set catch_photo_source = 'camera'
 where catch_photo_source is null
   and catch_photo_url is not null;

alter table public.catches
  drop constraint if exists catches_catch_photo_source_check,
  add constraint catches_catch_photo_source_check
    check (catch_photo_source is null or catch_photo_source in ('camera', 'gallery'));

create or replace function public.is_convention_gallery_catchable(p_convention_id uuid)
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

create or replace function public.is_profile_convention_gallery_catch_eligible(
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
      and public.is_convention_gallery_catchable(pc.convention_id)
      and (
        coalesce(c.location_verification_required, false) = false
        or pc.verification_method = 'grandfathered'
        or (pc.verification_method = 'manual_override' and pc.override_at is not null)
        or (
          pc.verification_method = 'gps'
          and pc.verified_at is not null
          and (c.started_at is null or pc.verified_at >= c.started_at)
        )
      )
  );
$$;

create or replace function public.get_gallery_profile_convention_ids(p_profile_id uuid)
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
    and public.is_profile_convention_gallery_catch_eligible(pc.profile_id, pc.convention_id)
  order by c.start_date asc nulls last, pc.created_at desc;
$$;

create or replace function public.get_gallery_shared_convention_ids(
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
    and public.is_profile_convention_gallery_catch_eligible(p_profile_id, pc.convention_id)
    and public.is_profile_convention_gallery_catch_eligible(f.owner_id, pc.convention_id)
  order by c.start_date asc nulls last, pc.created_at desc;
$$;

drop function if exists public.create_catch_with_approval(uuid, uuid, uuid, boolean);
drop function if exists public.create_catch_with_approval(uuid, uuid, uuid, boolean, boolean);

create or replace function public.create_catch_with_approval(
  p_fursuit_id uuid,
  p_catcher_id uuid,
  p_convention_id uuid default null::uuid,
  p_is_tutorial boolean default false,
  p_force_pending boolean default false,
  p_catch_photo_source text default null::text
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
  v_is_gallery_catch boolean := p_catch_photo_source = 'gallery';
begin
  if p_catch_photo_source is not null and p_catch_photo_source not in ('camera', 'gallery') then
    raise exception 'Invalid catch photo source';
  end if;

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

  if v_is_gallery_catch and p_convention_id is null then
    raise exception 'Gallery catches require a convention';
  end if;

  if p_convention_id is not null then
    if v_is_gallery_catch then
      if not public.is_convention_gallery_catchable(p_convention_id) then
        raise exception 'Convention is not accepting gallery catches';
      end if;

      if not public.is_profile_convention_gallery_catch_eligible(p_catcher_id, p_convention_id) then
        raise exception 'Catcher must have a playable convention before catching';
      end if;

      if not public.is_profile_convention_gallery_catch_eligible(v_fursuit_owner_id, p_convention_id) then
        raise exception 'Fursuit owner must have a playable convention before catching';
      end if;
    else
      if not public.is_convention_joinable(p_convention_id) then
        raise exception 'Convention is not live';
      end if;

      if not public.is_profile_convention_gameplay_eligible(p_catcher_id, p_convention_id) then
        raise exception 'Catcher must join the live convention before catching';
      end if;

      if not public.is_profile_convention_gameplay_eligible(v_fursuit_owner_id, p_convention_id) then
        raise exception 'Fursuit owner must join the live convention before catching';
      end if;
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

  if (v_owner_catch_mode = 'MANUAL_APPROVAL' or p_force_pending or v_is_gallery_catch) and not p_is_tutorial then
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
      caught_at,
      catch_photo_source
    )
    values (
      p_fursuit_id,
      p_catcher_id,
      p_convention_id,
      p_is_tutorial,
      v_catch_status,
      v_expires_at,
      now(),
      p_catch_photo_source
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

drop function if exists public.get_pending_catches(uuid);

create or replace function public.get_pending_catches(p_user_id uuid)
returns table (
  catch_id uuid,
  catcher_id uuid,
  catcher_username text,
  catcher_avatar_url text,
  fursuit_id uuid,
  fursuit_name text,
  fursuit_avatar_url text,
  caught_at timestamp with time zone,
  expires_at timestamp with time zone,
  convention_id uuid,
  convention_name text,
  time_remaining interval,
  catch_photo_url text,
  catch_photo_source text
)
language sql
security definer
set search_path to 'public'
as $$
  select
    c.id as catch_id,
    c.catcher_id,
    p.username as catcher_username,
    p.avatar_url as catcher_avatar_url,
    c.fursuit_id,
    f.name as fursuit_name,
    f.avatar_url as fursuit_avatar_url,
    c.caught_at,
    c.expires_at,
    c.convention_id,
    conv.name as convention_name,
    (c.expires_at - now()) as time_remaining,
    c.catch_photo_url,
    c.catch_photo_source
  from public.catches c
  join public.fursuits f on c.fursuit_id = f.id
  join public.profiles p on c.catcher_id = p.id
  left join public.conventions conv on c.convention_id = conv.id
  where f.owner_id = p_user_id
    and c.status = 'PENDING'
    and c.expires_at > now()
  order by c.caught_at desc;
$$;

grant execute on function public.is_convention_gallery_catchable(uuid) to authenticated, service_role;
grant execute on function public.is_profile_convention_gallery_catch_eligible(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_gallery_profile_convention_ids(uuid) to authenticated, service_role;
grant execute on function public.get_gallery_shared_convention_ids(uuid, uuid) to authenticated, service_role;
grant execute on function public.create_catch_with_approval(uuid, uuid, uuid, boolean, boolean, text) to service_role;
grant execute on function public.get_pending_catches(uuid) to authenticated, service_role;
