-- Finish removing runtime dependencies on dropped tutorial catch columns.
-- Legacy tutorial fursuits remain tracked through tutorial_fursuits/is_tutorial_fursuit().

update public.daily_tasks
   set metadata = metadata - 'includeTutorialCatches' - 'include_tutorial_catches'
 where metadata ? 'includeTutorialCatches'
    or metadata ? 'include_tutorial_catches';

drop function if exists public.create_catch_with_event(
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
);

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

  if not public.can_catch_fursuit_as_profile(p_catcher_id, p_fursuit_id) then
    raise exception 'Adult boundary restricted catch'
      using errcode = '42501';
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
         and fc.roster_state = 'active'
         and fc.active_until is null
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

  if v_owner_catch_mode = 'MANUAL_APPROVAL' or p_force_pending or v_is_gallery_catch then
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
  text,
  text,
  text,
  text,
  text
) to service_role;

drop function if exists public.create_catch_with_approval(uuid, uuid, uuid, boolean);
drop function if exists public.create_catch_with_approval(uuid, uuid, uuid, boolean, boolean);
drop function if exists public.create_catch_with_approval(uuid, uuid, uuid, boolean, boolean, text);

create or replace function public.create_catch_with_approval(
  p_fursuit_id uuid,
  p_catcher_id uuid,
  p_convention_id uuid default null::uuid,
  p_force_pending boolean default false,
  p_catch_photo_source text default null::text
)
returns json
language sql
security definer
set search_path to 'public'
as $$
  select public.create_catch_with_event(
    p_fursuit_id,
    p_catcher_id,
    p_convention_id,
    p_force_pending,
    p_catch_photo_source,
    null,
    null,
    null,
    case when p_catch_photo_source is null then 'not_required' else 'pending_upload' end
  );
$$;

grant execute on function public.create_catch_with_approval(uuid, uuid, uuid, boolean, text)
  to service_role;

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
    return json_build_object(
      'success', true,
      'photo_upload_state', 'uploaded',
      'event_id', null,
      'event_duplicate', true,
      'event_enqueued', false
    );
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

revoke execute on function public.attach_catch_photo_after_upload(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.attach_catch_photo_after_upload(uuid, uuid, text, text, text)
  to service_role;

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
set search_path = 'public', 'extensions'
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_is_admin boolean := auth.role() = 'service_role';
  v_convention record;
  v_verification jsonb;
  v_method text := coalesce(p_verification_method, 'none');
  v_stored_location jsonb := p_verified_location;
  v_requires_live_verification boolean := false;
  v_was_active_member boolean := false;
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
      v_stored_location := p_verified_location;
    end if;
  else
    if v_method not in ('manual_override', 'grandfathered') then
      v_method := 'none';
      v_stored_location := null;
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
    v_stored_location,
    v_method,
    case when v_method = 'gps' then now() else null end,
    case when v_method = 'manual_override' then auth.uid() else null end,
    case when v_method = 'manual_override' then p_override_reason else null end,
    case when v_method = 'manual_override' then now() else null end,
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
    override_actor_id = excluded.override_actor_id,
    override_reason = excluded.override_reason,
    override_at = excluded.override_at,
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
end;
$$;

grant execute on function public.opt_in_to_convention(uuid, uuid, jsonb, text, text)
  to authenticated, service_role;

create or replace function public.validate_catch_reciprocal_offer(
  p_primary_catch_id uuid,
  p_offered_by_profile_id uuid,
  p_offered_fursuit_id uuid
)
returns table (
  recipient_profile_id uuid,
  convention_id uuid,
  offered_fursuit_name text,
  offered_fursuit_avatar_path text,
  offered_fursuit_avatar_url text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_primary record;
  v_offered record;
begin
  select
    c.id,
    c.catcher_id,
    c.fursuit_id,
    c.convention_id,
    c.status,
    c.catch_photo_source,
    f.owner_id as caught_fursuit_owner_id
  into v_primary
  from public.catches c
  join public.fursuits f on f.id = c.fursuit_id
  where c.id = p_primary_catch_id;

  if not found then
    raise exception 'Primary catch not found';
  end if;

  if v_primary.catcher_id is distinct from p_offered_by_profile_id then
    raise exception 'Reciprocal offer must be created by the primary catcher';
  end if;

  if v_primary.convention_id is null then
    raise exception 'Reciprocal offers require a convention';
  end if;

  select
    f.id,
    f.owner_id,
    f.name,
    f.avatar_path,
    f.avatar_url,
    f.is_flagged
  into v_offered
  from public.fursuits f
  where f.id = p_offered_fursuit_id;

  if not found then
    raise exception 'Offered fursuit not found';
  end if;

  if v_offered.owner_id is distinct from p_offered_by_profile_id then
    raise exception 'You can only offer one of your own fursuits';
  end if;

  if public.is_tutorial_fursuit(p_offered_fursuit_id) then
    raise exception 'Tutorial fursuits cannot be offered for reciprocal catches';
  end if;

  if coalesce(v_offered.is_flagged, false) then
    raise exception 'This fursuit cannot be offered for reciprocal catches';
  end if;

  if v_primary.caught_fursuit_owner_id is null
     or v_primary.caught_fursuit_owner_id = p_offered_by_profile_id then
    raise exception 'Reciprocal recipient is not valid';
  end if;

  if public.is_blocked(p_offered_by_profile_id, v_primary.caught_fursuit_owner_id) then
    raise exception 'Cannot create reciprocal catch for this player';
  end if;

  if v_primary.catch_photo_source = 'gallery' then
    if not public.is_profile_convention_gallery_catch_eligible(
      p_offered_by_profile_id,
      v_primary.convention_id
    ) then
      raise exception 'Offering player must be eligible for gallery catches at this convention';
    end if;

    if not public.is_profile_convention_gallery_catch_eligible(
      v_primary.caught_fursuit_owner_id,
      v_primary.convention_id
    ) then
      raise exception 'Recipient must be eligible for gallery catches at this convention';
    end if;
  elsif not public.is_profile_convention_gameplay_eligible(
    p_offered_by_profile_id,
    v_primary.convention_id
  ) then
    raise exception 'Offering player must be ready to catch for this convention';
  elsif not public.is_profile_convention_gameplay_eligible(
    v_primary.caught_fursuit_owner_id,
    v_primary.convention_id
  ) then
    raise exception 'Recipient must be ready to catch for this convention';
  end if;

  if not exists (
    select 1
    from public.fursuit_conventions fc
    where fc.fursuit_id = p_offered_fursuit_id
      and fc.convention_id = v_primary.convention_id
      and fc.roster_state = 'active'
      and fc.active_until is null
  ) then
    raise exception 'Offered fursuit must be listed for this convention';
  end if;

  if not public.can_catch_fursuit_as_profile(
    v_primary.caught_fursuit_owner_id,
    p_offered_fursuit_id
  ) then
    raise exception 'Adult boundary restricted reciprocal catch'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.catches c
    where c.fursuit_id = p_offered_fursuit_id
      and c.catcher_id = v_primary.caught_fursuit_owner_id
      and c.convention_id = v_primary.convention_id
      and c.status in ('ACCEPTED', 'PENDING')
  ) then
    raise exception 'Reciprocal fursuit already caught at this convention';
  end if;

  return query
  select
    v_primary.caught_fursuit_owner_id,
    v_primary.convention_id,
    v_offered.name,
    v_offered.avatar_path,
    v_offered.avatar_url;
end;
$function$;

grant execute on function public.validate_catch_reciprocal_offer(uuid, uuid, uuid)
  to service_role;

create or replace function public.process_catch_reciprocal_offer(p_offer_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_offer record;
  v_validation record;
  v_reciprocal_catch_id uuid;
  v_catch_number integer;
  v_event_id uuid;
  v_event_duplicate boolean := false;
  v_event_enqueued boolean := false;
  v_client_attempt_id text;
begin
  select
    o.*,
    c.status as primary_status
  into v_offer
  from public.catch_reciprocal_offers o
  join public.catches c on c.id = o.primary_catch_id
  where o.id = p_offer_id
  for update of o;

  if not found then
    return json_build_object('status', 'NOT_FOUND');
  end if;

  if v_offer.status <> 'PENDING' then
    return json_build_object(
      'offer_id', v_offer.id,
      'status', v_offer.status,
      'reciprocal_catch_id', v_offer.reciprocal_catch_id,
      'failure_reason', v_offer.failure_reason,
      'event_enqueued', false
    );
  end if;

  if v_offer.primary_status in ('REJECTED', 'EXPIRED') then
    update public.catch_reciprocal_offers
       set status = 'CANCELED',
           failure_reason = 'Primary catch was not accepted',
           updated_at = now(),
           processed_at = now()
     where id = v_offer.id;

    return json_build_object(
      'offer_id', v_offer.id,
      'status', 'CANCELED',
      'failure_reason', 'Primary catch was not accepted',
      'event_enqueued', false
    );
  end if;

  if v_offer.primary_status <> 'ACCEPTED' then
    return json_build_object(
      'offer_id', v_offer.id,
      'status', 'PENDING',
      'event_enqueued', false
    );
  end if;

  begin
    select *
      into v_validation
    from public.validate_catch_reciprocal_offer(
      v_offer.primary_catch_id,
      v_offer.offered_by_profile_id,
      v_offer.offered_fursuit_id
    )
    limit 1;

    v_client_attempt_id := format('reciprocal:%s', v_offer.id);

    insert into public.catches (
      fursuit_id,
      catcher_id,
      convention_id,
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
      v_offer.offered_fursuit_id,
      v_offer.recipient_profile_id,
      v_offer.convention_id,
      'ACCEPTED',
      null,
      now(),
      null,
      null,
      null,
      v_client_attempt_id,
      'not_required'
    )
    returning id, catch_number into v_reciprocal_catch_id, v_catch_number;

    select event_id, duplicate, enqueued
      into v_event_id, v_event_duplicate, v_event_enqueued
    from app_private.ingest_gameplay_event(
      'catch_performed',
      v_offer.recipient_profile_id,
      v_offer.convention_id,
      jsonb_build_object(
        'catch_id', v_reciprocal_catch_id,
        'fursuit_id', v_offer.offered_fursuit_id,
        'catcher_id', v_offer.recipient_profile_id,
        'fursuit_owner_id', v_offer.offered_by_profile_id,
        'convention_id', v_offer.convention_id,
        'status', 'ACCEPTED',
        'source', 'reciprocal_offer',
        'primary_catch_id', v_offer.primary_catch_id,
        'reciprocal_offer_id', v_offer.id,
        'client_attempt_id', v_client_attempt_id
      ),
      now(),
      format('catch:%s:%s', v_reciprocal_catch_id, 'catch_performed')
    );

    update public.catch_reciprocal_offers
       set status = 'COMPLETED',
           reciprocal_catch_id = v_reciprocal_catch_id,
           failure_reason = null,
           updated_at = now(),
           processed_at = now()
     where id = v_offer.id;

    return json_build_object(
      'offer_id', v_offer.id,
      'status', 'COMPLETED',
      'reciprocal_catch_id', v_reciprocal_catch_id,
      'catch_number', v_catch_number,
      'event_id', v_event_id,
      'event_duplicate', coalesce(v_event_duplicate, false),
      'event_enqueued', coalesce(v_event_enqueued, false),
      'fursuit_id', v_offer.offered_fursuit_id,
      'fursuit_name', v_validation.offered_fursuit_name
    );
  exception
    when unique_violation then
      update public.catch_reciprocal_offers
         set status = 'FAILED',
             failure_reason = 'Reciprocal catch already exists',
             updated_at = now(),
             processed_at = now()
       where id = v_offer.id;

      return json_build_object(
        'offer_id', v_offer.id,
        'status', 'FAILED',
        'failure_reason', 'Reciprocal catch already exists',
        'event_enqueued', false
      );
    when others then
      raise warning 'process_catch_reciprocal_offer failed for offer %: %', v_offer.id, sqlerrm;

      update public.catch_reciprocal_offers
         set status = 'FAILED',
             failure_reason = 'DB_ERROR',
             updated_at = now(),
             processed_at = now()
       where id = v_offer.id;

      return json_build_object(
        'offer_id', v_offer.id,
        'status', 'FAILED',
        'failure_reason', 'DB_ERROR',
        'event_enqueued', false
      );
  end;
end;
$function$;

grant execute on function public.process_catch_reciprocal_offer(uuid)
  to service_role;

create or replace function public.confirm_catch(
  p_catch_id uuid,
  p_decision text,
  p_user_id uuid,
  p_reason text default null::text
)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_catch record;
  v_new_status text;
  v_result json;
  v_decided_at timestamptz := now();
  v_reciprocal_offer json := null;
begin
  if p_decision not in ('accept', 'reject') then
    raise exception 'Invalid decision. Must be accept or reject';
  end if;

  select
    c.*,
    f.owner_id,
    f.name as fursuit_name,
    fs.name as species_name,
    coalesce((
      select jsonb_agg(fc.name order by fca.position)
      from public.fursuit_color_assignments fca
      join public.fursuit_colors fc on fc.id = fca.color_id
      where fca.fursuit_id = c.fursuit_id
    ), '[]'::jsonb) as color_names,
    p.username as catcher_username
  into v_catch
  from public.catches c
  join public.fursuits f on c.fursuit_id = f.id
  join public.profiles p on c.catcher_id = p.id
  left join public.fursuit_species fs on fs.id = f.species_id
  where c.id = p_catch_id
    and c.status = 'PENDING'
    and c.expires_at > now()
  for update of c;

  if not found then
    raise exception 'Catch not found or already decided';
  end if;

  if v_catch.owner_id != p_user_id then
    raise exception 'You do not own this fursuit';
  end if;

  v_new_status := case
    when p_decision = 'accept' then 'ACCEPTED'
    else 'REJECTED'
  end;

  update public.catches
     set status = v_new_status,
         decided_at = v_decided_at,
         decided_by_user_id = p_user_id,
         rejection_reason = case when p_decision = 'reject' then p_reason else null end
   where id = p_catch_id;

  perform public.notify_catch_decision(
    p_catch_id,
    v_catch.catcher_id,
    v_catch.fursuit_id,
    v_catch.fursuit_name,
    p_decision,
    p_reason
  );

  if p_decision = 'accept' then
    perform app_private.ingest_gameplay_event(
      'catch_confirmed',
      v_catch.catcher_id,
      v_catch.convention_id,
      jsonb_build_object(
        'catch_id', p_catch_id,
        'decision', p_decision
      ),
      v_decided_at,
      format('catch:%s:confirmed', p_catch_id)
    );

    select json_build_object(
      'offer_id', o.id,
      'status', o.status,
      'reciprocal_catch_id', o.reciprocal_catch_id,
      'failure_reason', o.failure_reason
    )
    into v_reciprocal_offer
    from public.catch_reciprocal_offers o
    where o.primary_catch_id = p_catch_id
    limit 1;

    begin
      perform public.process_gameplay_queue_if_active();
    exception
      when others then
        raise warning 'confirm_catch failed to wake gameplay queue for catch %: %', p_catch_id, sqlerrm;
    end;
  end if;

  select json_build_object(
    'success', true,
    'catch_id', p_catch_id,
    'decision', p_decision,
    'status', v_new_status,
    'fursuit_name', v_catch.fursuit_name,
    'catcher_id', v_catch.catcher_id,
    'fursuit_id', v_catch.fursuit_id,
    'convention_id', v_catch.convention_id,
    'reciprocal_offer', v_reciprocal_offer
  ) into v_result;

  return v_result;
end;
$function$;

grant execute on function public.confirm_catch(uuid, text, uuid, text)
  to authenticated, service_role;

create or replace function public.count_accepted_catches_by_catcher_on_date(
  p_catcher_id uuid,
  p_convention_id uuid,
  p_timezone text,
  p_date date
)
returns bigint
language sql
stable
set search_path to 'public'
as $function$
  select count(*)
  from public.catches
  where catcher_id = p_catcher_id
    and convention_id = p_convention_id
    and status = 'ACCEPTED'
    and caught_at is not null
    and (caught_at at time zone p_timezone)::date = p_date;
$function$;

create or replace function public.count_distinct_conventions(user_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select count(distinct convention_id)::integer
  from public.catches
  where catcher_id = user_id
    and status = 'ACCEPTED'
    and convention_id is not null;
$function$;

create or replace function public.count_distinct_conventions_for_fursuit(p_fursuit_id uuid)
returns bigint
language sql
stable
set search_path to 'public'
as $function$
  select count(distinct convention_id)
  from public.catches
  where fursuit_id = p_fursuit_id
    and convention_id is not null
    and status = 'ACCEPTED';
$function$;

create or replace function public.count_distinct_local_days_for_fursuit_at_convention(
  p_fursuit_id uuid,
  p_convention_id uuid,
  p_timezone text
)
returns bigint
language sql
stable
set search_path to 'public'
as $function$
  select count(distinct (caught_at at time zone p_timezone)::date)
  from public.catches
  where fursuit_id = p_fursuit_id
    and convention_id = p_convention_id
    and status = 'ACCEPTED'
    and caught_at is not null;
$function$;

create or replace function public.count_distinct_species_caught(user_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select count(distinct f.species_id)::integer
  from public.catches c
  join public.fursuits f on f.id = c.fursuit_id
  where c.catcher_id = user_id
    and c.status = 'ACCEPTED'
    and f.species_id is not null;
$function$;

create or replace function public.count_unique_catchers_for_fursuit_lifetime(p_fursuit_id uuid)
returns bigint
language sql
stable
set search_path to 'public'
as $function$
  select count(distinct catcher_id)
  from public.catches
  where fursuit_id = p_fursuit_id
    and status = 'ACCEPTED';
$function$;

create or replace function public.count_distinct_makers_caught_at_convention(
  p_catcher_id uuid,
  p_convention_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select count(distinct fm.normalized_maker_name)::integer
  from public.catches c
  join public.fursuit_makers fm on fm.fursuit_id = c.fursuit_id
  where c.catcher_id = p_catcher_id
    and c.convention_id = p_convention_id
    and c.status = 'ACCEPTED'
    and btrim(fm.normalized_maker_name) <> '';
$function$;

create or replace function public.count_distinct_self_made_fursuits_caught(
  p_catcher_id uuid,
  p_self_made_aliases text[]
)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select count(distinct c.fursuit_id)::integer
  from public.catches c
  join public.fursuit_makers fm on fm.fursuit_id = c.fursuit_id
  where c.catcher_id = p_catcher_id
    and c.status = 'ACCEPTED'
    and fm.normalized_maker_name = any(p_self_made_aliases);
$function$;

create or replace function public.has_new_maker_for_catcher_at_convention(
  p_catcher_id uuid,
  p_convention_id uuid,
  p_catch_id uuid,
  p_normalized_maker_names text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with requested_makers as (
    select distinct btrim(value) as normalized_maker_name
    from unnest(p_normalized_maker_names) as value
    where btrim(value) <> ''
  ),
  previous_makers as (
    select distinct fm.normalized_maker_name
    from public.catches c
    join public.fursuit_makers fm on fm.fursuit_id = c.fursuit_id
    where c.catcher_id = p_catcher_id
      and c.convention_id = p_convention_id
      and c.id <> p_catch_id
      and c.status = 'ACCEPTED'
  )
  select exists (
    select 1
    from requested_makers rm
    where not exists (
      select 1
      from previous_makers pm
      where pm.normalized_maker_name = rm.normalized_maker_name
    )
  );
$function$;

grant execute on function public.count_distinct_makers_caught_at_convention(uuid, uuid)
  to service_role;
grant execute on function public.count_distinct_self_made_fursuits_caught(uuid, text[])
  to service_role;
grant execute on function public.has_new_maker_for_catcher_at_convention(uuid, uuid, uuid, text[])
  to service_role;

create or replace function public.get_fursuit_convention_stats(
  p_fursuit_id uuid,
  p_convention_id uuid
)
returns table(total_catches bigint, unique_catchers bigint)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select
    count(*)::bigint as total_catches,
    count(distinct catcher_id)::bigint as unique_catchers
  from public.catches
  where fursuit_id = p_fursuit_id
    and convention_id = p_convention_id
    and status = 'ACCEPTED';
$function$;

create or replace function public.get_event_dashboard_summary(p_convention_id uuid)
returns table(
  total_catches bigint,
  active_players bigint,
  active_fursuits bigint,
  pending_approval bigint,
  avg_catches_per_hour numeric,
  peak_hour timestamp with time zone,
  total_achievements bigint
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  select
    (
      select count(*)
      from public.catches
      where convention_id = p_convention_id
        and status = 'ACCEPTED'
        and not exists (
          select 1
          from public.audit_log
          where audit_log.entity_type = 'catch'
            and audit_log.entity_id = catches.id
            and audit_log.action = 'simulate_catch'
        )
    )::bigint,
    (
      select count(distinct catcher_id)
      from public.catches
      where convention_id = p_convention_id
    )::bigint,
    (
      select count(distinct fursuit_id)
      from public.catches
      where convention_id = p_convention_id
    )::bigint,
    (
      select count(*)
      from public.catches
      where convention_id = p_convention_id
        and status = 'PENDING'
    )::bigint,
    (
      select coalesce(avg(catch_count), 0)::numeric
      from public.mv_catches_hourly
      where convention_id = p_convention_id
    ),
    (
      select hour_bucket
      from public.mv_catches_hourly
      where convention_id = p_convention_id
      order by catch_count desc
      limit 1
    ),
    (
      select count(*)
      from public.user_achievements
      where user_id in (
        select distinct catcher_id
        from public.catches
        where convention_id = p_convention_id
      )
    )::bigint;
end;
$function$;

create or replace function public.get_global_dashboard_summary()
returns table(
  total_catches bigint,
  active_players bigint,
  active_fursuits bigint,
  pending_approval bigint,
  avg_catches_per_hour numeric,
  peak_hour timestamp with time zone,
  total_achievements bigint
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  select
    (
      select count(*)
      from public.catches
      where status = 'ACCEPTED'
        and not exists (
          select 1
          from public.audit_log
          where audit_log.entity_type = 'catch'
            and audit_log.entity_id = catches.id
            and audit_log.action = 'simulate_catch'
        )
    )::bigint,
    (
      select count(distinct catcher_id)
      from public.catches
    )::bigint,
    (
      select count(distinct fursuit_id)
      from public.catches
    )::bigint,
    (
      select count(*)
      from public.catches
      where status = 'PENDING'
    )::bigint,
    (
      select coalesce(avg(catch_count), 0)::numeric
      from public.mv_catches_hourly
    ),
    (
      select hour_bucket
      from public.mv_catches_hourly
      order by catch_count desc
      limit 1
    ),
    (
      select count(*)
      from public.user_achievements
    )::bigint;
end;
$function$;

create or replace function public.get_convention_lifecycle_health_counts(
  p_convention_ids uuid[],
  p_local_days jsonb default '{}'::jsonb,
  p_retry_window_start timestamp with time zone default now() - interval '7 days',
  p_throttle_window_start timestamp with time zone default now() - interval '6 hours'
)
returns table (
  convention_id uuid,
  convention_tasks_count integer,
  today_assignments_count integer,
  accepted_convention_catches_count integer,
  pending_convention_catches_count integer,
  active_profile_memberships_count integer,
  active_fursuit_assignments_count integer,
  participant_recaps_count integer,
  last_automation_attempt_at timestamp with time zone,
  last_automation_source text,
  automation_retry_attempts_last_7_days integer,
  recent_cron_close_attempt boolean,
  recent_cron_retry_attempt boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with requested as (
    select distinct unnest(coalesce(p_convention_ids, array[]::uuid[])) as convention_id
  ),
  convention_tasks as (
    select dt.convention_id, count(*)::integer as row_count
    from public.daily_tasks dt
    join requested r on r.convention_id = dt.convention_id
    where dt.is_active = true
    group by dt.convention_id
  ),
  today_assignments as (
    select da.convention_id, count(*)::integer as row_count
    from public.daily_assignments da
    join requested r on r.convention_id = da.convention_id
    where da.day = nullif(p_local_days ->> da.convention_id::text, '')::date
    group by da.convention_id
  ),
  accepted_catches as (
    select c.convention_id, count(*)::integer as row_count
    from public.catches c
    join requested r on r.convention_id = c.convention_id
    where c.status = 'ACCEPTED'
    group by c.convention_id
  ),
  pending_catches as (
    select c.convention_id, count(*)::integer as row_count
    from public.catches c
    join requested r on r.convention_id = c.convention_id
    where c.status = 'PENDING'
    group by c.convention_id
  ),
  profile_memberships as (
    select pc.convention_id, count(*)::integer as row_count
    from public.profile_conventions pc
    join requested r on r.convention_id = pc.convention_id
    where pc.attendance_state = 'active'
      and pc.active_until is null
    group by pc.convention_id
  ),
  fursuit_assignments as (
    select fc.convention_id, count(*)::integer as row_count
    from public.fursuit_conventions fc
    join requested r on r.convention_id = fc.convention_id
    where fc.roster_state = 'active'
      and fc.active_until is null
    group by fc.convention_id
  ),
  participant_recaps as (
    select cpr.convention_id, count(*)::integer as row_count
    from public.convention_participant_recaps cpr
    join requested r on r.convention_id = cpr.convention_id
    group by cpr.convention_id
  ),
  last_automation as (
    select distinct on (al.entity_id)
      al.entity_id as convention_id,
      al.created_at,
      al.context ->> 'source' as source
    from public.audit_log al
    join requested r on r.convention_id = al.entity_id
    where al.entity_type = 'convention'
      and al.action in (
        'close_convention_attempt',
        'close_convention_noop',
        'regenerate_convention_recaps_attempt'
      )
      and al.context ->> 'source' in (
        'cron_close',
        'cron_retry',
        'admin_close',
        'admin_retry',
        'admin_regenerate'
      )
    order by al.entity_id, al.created_at desc
  ),
  automation_counts as (
    select
      al.entity_id as convention_id,
      count(*) filter (
        where al.action = 'close_convention_attempt'
          and al.context ->> 'source' = 'cron_retry'
          and al.created_at >= p_retry_window_start
      )::integer as retry_attempts_last_7_days,
      coalesce(
        bool_or(al.created_at >= p_throttle_window_start) filter (
          where al.action = 'close_convention_attempt'
            and al.context ->> 'source' = 'cron_close'
        ),
        false
      ) as recent_cron_close_attempt,
      coalesce(
        bool_or(al.created_at >= p_throttle_window_start) filter (
          where al.action = 'close_convention_attempt'
            and al.context ->> 'source' = 'cron_retry'
        ),
        false
      ) as recent_cron_retry_attempt
    from public.audit_log al
    join requested r on r.convention_id = al.entity_id
    where al.entity_type = 'convention'
      and al.action in ('close_convention_attempt', 'close_convention_noop')
      and al.context ->> 'source' in ('cron_close', 'cron_retry')
    group by al.entity_id
  )
  select
    r.convention_id,
    coalesce(ct.row_count, 0) as convention_tasks_count,
    coalesce(ta.row_count, 0) as today_assignments_count,
    coalesce(ac.row_count, 0) as accepted_convention_catches_count,
    coalesce(pc.row_count, 0) as pending_convention_catches_count,
    coalesce(pm.row_count, 0) as active_profile_memberships_count,
    coalesce(fa.row_count, 0) as active_fursuit_assignments_count,
    coalesce(pr.row_count, 0) as participant_recaps_count,
    la.created_at as last_automation_attempt_at,
    la.source as last_automation_source,
    coalesce(auc.retry_attempts_last_7_days, 0) as automation_retry_attempts_last_7_days,
    coalesce(auc.recent_cron_close_attempt, false) as recent_cron_close_attempt,
    coalesce(auc.recent_cron_retry_attempt, false) as recent_cron_retry_attempt
  from requested r
  left join convention_tasks ct on ct.convention_id = r.convention_id
  left join today_assignments ta on ta.convention_id = r.convention_id
  left join accepted_catches ac on ac.convention_id = r.convention_id
  left join pending_catches pc on pc.convention_id = r.convention_id
  left join profile_memberships pm on pm.convention_id = r.convention_id
  left join fursuit_assignments fa on fa.convention_id = r.convention_id
  left join participant_recaps pr on pr.convention_id = r.convention_id
  left join last_automation la on la.convention_id = r.convention_id
  left join automation_counts auc on auc.convention_id = r.convention_id;
$$;

grant execute on function public.get_convention_lifecycle_health_counts(
  uuid[],
  jsonb,
  timestamp with time zone,
  timestamp with time zone
) to service_role;

notify pgrst, 'reload schema';
