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
  v_stored_location jsonb := p_verified_location;
  v_requires_live_verification boolean := false;
  v_was_member boolean := false;
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
  )
  into v_was_member;

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

  if not v_was_member then
    insert into public.fursuit_conventions (
      fursuit_id,
      convention_id,
      roster_visible
    )
    select
      f.id,
      p_convention_id,
      true
    from public.fursuits f
    where f.owner_id = p_profile_id
      and f.is_tutorial = false
    on conflict (fursuit_id, convention_id) do update
    set roster_visible = true;
  end if;
end;
$$;

grant execute on function public.opt_in_to_convention(uuid, uuid, jsonb, text, text)
  to authenticated, service_role;

insert into public.fursuit_conventions (
  fursuit_id,
  convention_id,
  roster_visible
)
select
  f.id,
  pc.convention_id,
  true
from public.profile_conventions pc
join public.fursuits f on f.owner_id = pc.profile_id
where f.is_tutorial = false
on conflict (fursuit_id, convention_id) do update
set roster_visible = true;
