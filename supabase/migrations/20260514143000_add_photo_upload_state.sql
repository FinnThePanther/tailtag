alter table public.catches
  add column if not exists photo_upload_state text not null default 'not_required';

update public.catches
   set photo_upload_state = 'uploaded'
 where catch_photo_url is not null
   and photo_upload_state = 'not_required';

alter table public.catches
  drop constraint if exists catches_photo_upload_state_check,
  add constraint catches_photo_upload_state_check
    check (photo_upload_state in ('not_required', 'pending_upload', 'uploaded', 'failed'));

drop function if exists public.create_catch_with_event(
  uuid,
  uuid,
  uuid,
  boolean,
  boolean,
  text,
  text,
  text,
  text
);

create or replace function public.create_catch_with_event(
  p_fursuit_id uuid,
  p_catcher_id uuid,
  p_convention_id uuid default null::uuid,
  p_is_tutorial boolean default false,
  p_force_pending boolean default false,
  p_catch_photo_source text default null::text,
  p_catch_photo_path text default null::text,
  p_catch_photo_url text default null::text,
  p_client_attempt_id text default null::text,
  p_photo_upload_state text default null::text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner_catch_mode text;
  v_fursuit_owner_id uuid;
  v_fursuit_name text;
  v_fursuit_avatar_path text;
  v_fursuit_avatar_url text;
  v_fursuit_species_id uuid;
  v_fursuit_species_name text;
  v_catch_status text;
  v_expires_at timestamptz;
  v_catch_id uuid;
  v_catch_number integer;
  v_event_type text;
  v_event_id uuid;
  v_event_duplicate boolean := false;
  v_event_enqueued boolean := false;
  v_result json;
  v_photo_source text := p_catch_photo_source;
  v_photo_upload_state text := p_photo_upload_state;
  v_is_gallery_catch boolean;
  v_defer_pending_event boolean;
  v_normalized_client_attempt_id text := nullif(btrim(p_client_attempt_id), '');
  v_constraint_name text;
  v_existing record;
begin
  if v_normalized_client_attempt_id is not null then
    select
      c.id,
      c.catch_number,
      c.status,
      c.expires_at,
      c.convention_id,
      c.catcher_id,
      c.fursuit_id,
      c.photo_upload_state,
      f.owner_id,
      f.name,
      f.avatar_path,
      f.avatar_url,
      f.species_id,
      fs.name as species_name
    into v_existing
    from public.catches c
    join public.fursuits f on f.id = c.fursuit_id
    left join public.fursuit_species fs on fs.id = f.species_id
    where c.client_attempt_id = v_normalized_client_attempt_id
      and c.catcher_id = p_catcher_id
    limit 1;

    if found then
      if v_existing.catcher_id <> p_catcher_id then
        raise exception 'Client attempt id belongs to another catcher';
      end if;

      return json_build_object(
        'catch_id', v_existing.id,
        'status', v_existing.status,
        'expires_at', v_existing.expires_at,
        'catch_number', v_existing.catch_number,
        'requires_approval', v_existing.status = 'PENDING',
        'fursuit_owner_id', v_existing.owner_id,
        'convention_id', v_existing.convention_id,
        'fursuit_id', v_existing.fursuit_id,
        'fursuit_name', v_existing.name,
        'fursuit_avatar_path', v_existing.avatar_path,
        'fursuit_avatar_url', v_existing.avatar_url,
        'fursuit_species_id', v_existing.species_id,
        'fursuit_species_name', v_existing.species_name,
        'photo_upload_state', v_existing.photo_upload_state,
        'event_id', null,
        'event_duplicate', true,
        'event_enqueued', false
      );
    end if;
  end if;

  if v_photo_source is null and p_catch_photo_url is not null then
    v_photo_source := 'camera';
  end if;

  if v_photo_source is not null and v_photo_source not in ('camera', 'gallery') then
    raise exception 'Invalid catch photo source';
  end if;

  if p_catch_photo_path is not null and p_catch_photo_url is null then
    raise exception 'Missing catch photo url';
  end if;

  if v_photo_upload_state is null then
    if p_catch_photo_url is not null then
      v_photo_upload_state := 'uploaded';
    elsif v_photo_source is not null then
      v_photo_upload_state := 'pending_upload';
    else
      v_photo_upload_state := 'not_required';
    end if;
  end if;

  if v_photo_upload_state not in ('not_required', 'pending_upload', 'uploaded', 'failed') then
    raise exception 'Invalid photo upload state';
  end if;

  if v_photo_source is null and v_photo_upload_state <> 'not_required' then
    raise exception 'Photo upload state requires a photo source';
  end if;

  if v_photo_source is not null and v_photo_upload_state = 'not_required' then
    raise exception 'Photo catches require a photo upload state';
  end if;

  if v_photo_upload_state = 'uploaded' and p_catch_photo_url is null then
    raise exception 'Uploaded photo catches require a photo url';
  end if;

  if p_catch_photo_url is not null and v_photo_upload_state <> 'uploaded' then
    raise exception 'Attached photo url requires uploaded state';
  end if;

  if v_photo_upload_state = 'failed' then
    raise exception 'New photo catches cannot start failed';
  end if;

  v_is_gallery_catch := v_photo_source = 'gallery';

  if auth.role() <> 'service_role' and auth.uid() is distinct from p_catcher_id then
    raise exception 'Catcher must match the authenticated user';
  end if;

  select
    coalesce(p.default_catch_mode, 'AUTO_ACCEPT'),
    f.owner_id,
    f.name,
    f.avatar_path,
    f.avatar_url,
    f.species_id,
    fs.name
  into
    v_owner_catch_mode,
    v_fursuit_owner_id,
    v_fursuit_name,
    v_fursuit_avatar_path,
    v_fursuit_avatar_url,
    v_fursuit_species_id,
    v_fursuit_species_name
  from public.fursuits f
  left join public.profiles p on p.id = f.owner_id
  left join public.fursuit_species fs on fs.id = f.species_id
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

      if not public.is_profile_convention_gallery_catch_eligible(
        p_profile_id => p_catcher_id,
        p_convention_id => p_convention_id
      ) then
        raise exception 'Catcher must have a playable convention before catching';
      end if;

      if not public.is_profile_convention_gallery_catch_eligible(
        p_profile_id => v_fursuit_owner_id,
        p_convention_id => p_convention_id
      ) then
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
      catch_photo_url,
      client_attempt_id,
      photo_upload_state
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
      p_catch_photo_url,
      v_normalized_client_attempt_id,
      v_photo_upload_state
    )
    returning id, catch_number into v_catch_id, v_catch_number;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;

      if v_constraint_name = 'catches_catcher_client_attempt_id_idx' then
        raise exception 'Client attempt id already used';
      end if;

      raise;
  end;

  v_event_type := case when v_catch_status = 'PENDING' then 'catch_pending' else 'catch_performed' end;
  v_defer_pending_event := v_event_type = 'catch_pending'
    and v_photo_source is not null
    and v_photo_upload_state = 'pending_upload';

  if not v_defer_pending_event then
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
        'photo_upload_state', v_photo_upload_state,
        'client_attempt_id', v_normalized_client_attempt_id
      ),
      now(),
      format('catch:%s:%s', v_catch_id, v_event_type)
    );
  end if;

  select json_build_object(
    'catch_id', v_catch_id,
    'status', v_catch_status,
    'expires_at', v_expires_at,
    'catch_number', v_catch_number,
    'requires_approval', v_catch_status = 'PENDING',
    'fursuit_owner_id', v_fursuit_owner_id,
    'convention_id', p_convention_id,
    'fursuit_id', p_fursuit_id,
    'fursuit_name', v_fursuit_name,
    'fursuit_avatar_path', v_fursuit_avatar_path,
    'fursuit_avatar_url', v_fursuit_avatar_url,
    'fursuit_species_id', v_fursuit_species_id,
    'fursuit_species_name', v_fursuit_species_name,
    'photo_upload_state', v_photo_upload_state,
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
  text,
  text
) to service_role;

create or replace function public.attach_catch_photo_after_upload(
  p_catch_id uuid,
  p_catcher_id uuid,
  p_catch_photo_path text,
  p_catch_photo_url text,
  p_catch_photo_source text default null::text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_catch record;
  v_photo_source text := p_catch_photo_source;
  v_event_id uuid;
  v_event_duplicate boolean := false;
  v_event_enqueued boolean := false;
begin
  if p_catch_photo_path is null or btrim(p_catch_photo_path) = '' then
    raise exception 'Missing catch photo path';
  end if;

  if p_catch_photo_url is null or btrim(p_catch_photo_url) = '' then
    raise exception 'Missing catch photo url';
  end if;

  if v_photo_source is not null and v_photo_source not in ('camera', 'gallery') then
    raise exception 'Invalid catch photo source';
  end if;

  select
    c.id,
    c.catcher_id,
    c.convention_id,
    c.fursuit_id,
    c.is_tutorial,
    c.status,
    c.catch_photo_path,
    c.catch_photo_source,
    c.photo_upload_state,
    f.owner_id as fursuit_owner_id
  into v_catch
  from public.catches c
  join public.fursuits f on f.id = c.fursuit_id
  where c.id = p_catch_id
  for update;

  if not found then
    raise exception 'Catch not found';
  end if;

  if v_catch.catcher_id <> p_catcher_id then
    raise exception 'Forbidden';
  end if;

  if v_catch.photo_upload_state = 'uploaded' then
    if v_catch.catch_photo_path is distinct from p_catch_photo_path then
      raise exception 'Catch photo is already uploaded';
    end if;
  elsif v_catch.photo_upload_state not in ('pending_upload', 'failed') then
    raise exception 'Catch photo upload is not pending';
  end if;

  if v_photo_source is null then
    v_photo_source := coalesce(v_catch.catch_photo_source, 'camera');
  end if;

  if v_catch.photo_upload_state <> 'uploaded' then
    update public.catches
       set catch_photo_path = p_catch_photo_path,
           catch_photo_url = p_catch_photo_url,
           catch_photo_source = v_photo_source,
           photo_upload_state = 'uploaded'
     where id = p_catch_id;
  end if;

  if v_catch.status = 'PENDING' then
    select event_id, duplicate, enqueued
      into v_event_id, v_event_duplicate, v_event_enqueued
    from app_private.ingest_gameplay_event(
      'catch_pending',
      v_catch.catcher_id,
      v_catch.convention_id,
      jsonb_build_object(
        'catch_id', v_catch.id,
        'fursuit_id', v_catch.fursuit_id,
        'catcher_id', v_catch.catcher_id,
        'fursuit_owner_id', v_catch.fursuit_owner_id,
        'convention_id', v_catch.convention_id,
        'is_tutorial', v_catch.is_tutorial,
        'status', v_catch.status,
        'catch_photo_source', v_photo_source,
        'photo_upload_state', 'uploaded'
      ),
      now(),
      format('catch:%s:%s', v_catch.id, 'catch_pending')
    );
  end if;

  return json_build_object(
    'success', true,
    'photo_upload_state', 'uploaded',
    'event_id', v_event_id,
    'event_duplicate', coalesce(v_event_duplicate, false),
    'event_enqueued', coalesce(v_event_enqueued, false)
  );
end;
$$;

revoke execute on function public.attach_catch_photo_after_upload(
  uuid,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.attach_catch_photo_after_upload(
  uuid,
  uuid,
  text,
  text,
  text
) to service_role;

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
  catch_photo_source text,
  photo_upload_state text
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
    c.catch_photo_source,
    c.photo_upload_state
  from public.catches c
  join public.fursuits f on c.fursuit_id = f.id
  join public.profiles p on c.catcher_id = p.id
  left join public.conventions conv on c.convention_id = conv.id
  where f.owner_id = p_user_id
    and c.status = 'PENDING'
    and c.expires_at > now()
    and (
      c.catch_photo_source is null
      or c.photo_upload_state = 'uploaded'
    )
  order by c.caught_at desc;
$$;

grant execute on function public.get_pending_catches(uuid) to authenticated, service_role;
