create or replace function public.create_catch_with_event(
  p_fursuit_id uuid,
  p_catcher_id uuid,
  p_convention_id uuid default null::uuid,
  p_is_tutorial boolean default false,
  p_force_pending boolean default false,
  p_catch_photo_source text default null::text,
  p_catch_photo_path text default null::text,
  p_catch_photo_url text default null::text,
  p_client_attempt_id text default null::text
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
  v_event_type text;
  v_event_id uuid;
  v_event_duplicate boolean;
  v_event_enqueued boolean;
  v_result json;
  v_photo_source text := p_catch_photo_source;
  v_is_gallery_catch boolean;
begin
  if v_photo_source is null and p_catch_photo_url is not null then
    v_photo_source := 'camera';
  end if;

  if v_photo_source is not null and v_photo_source not in ('camera', 'gallery') then
    raise exception 'Invalid catch photo source';
  end if;

  if p_catch_photo_path is not null and p_catch_photo_url is null then
    raise exception 'Missing catch photo url';
  end if;

  v_is_gallery_catch := v_photo_source = 'gallery';

  if v_is_gallery_catch and p_catch_photo_url is null then
    raise exception 'Gallery catches require a photo';
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
      catch_photo_source,
      catch_photo_path,
      catch_photo_url
    )
    values (
      p_fursuit_id,
      p_catcher_id,
      p_convention_id,
      p_is_tutorial,
      v_catch_status,
      v_expires_at,
      now(),
      v_photo_source,
      p_catch_photo_path,
      p_catch_photo_url
    )
    returning id, catch_number into v_catch_id, v_catch_number;
  exception
    when unique_violation then
      if p_convention_id is not null then
        raise exception 'Fursuit already caught at this convention';
      end if;

      raise exception 'Fursuit already caught or pending';
  end;

  v_event_type := case when v_catch_status = 'PENDING' then 'catch_pending' else 'catch_performed' end;

  select event_id, duplicate, enqueued
    into v_event_id, v_event_duplicate, v_event_enqueued
  from app_private.ingest_gameplay_event(
    v_event_type,
    p_catcher_id,
    p_convention_id,
    jsonb_build_object(
      'catch_id', v_catch_id,
      'fursuit_id', p_fursuit_id,
      'catcher_id', p_catcher_id,
      'fursuit_owner_id', v_fursuit_owner_id,
      'convention_id', p_convention_id,
      'is_tutorial', p_is_tutorial,
      'status', v_catch_status,
      'catch_photo_source', v_photo_source,
      'client_attempt_id', nullif(btrim(p_client_attempt_id), '')
    ),
    now(),
    format('catch:%s:%s', v_catch_id, v_event_type)
  );

  select json_build_object(
    'catch_id', v_catch_id,
    'status', v_catch_status,
    'expires_at', v_expires_at,
    'catch_number', v_catch_number,
    'requires_approval', v_catch_status = 'PENDING',
    'fursuit_owner_id', v_fursuit_owner_id,
    'convention_id', p_convention_id,
    'event_id', v_event_id,
    'event_duplicate', coalesce(v_event_duplicate, false),
    'event_enqueued', coalesce(v_event_enqueued, false)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.create_catch_with_event(
  uuid,
  uuid,
  uuid,
  boolean,
  boolean,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.create_catch_with_event(
  uuid,
  uuid,
  uuid,
  boolean,
  boolean,
  text,
  text,
  text,
  text
) to service_role;
