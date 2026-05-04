create unique index if not exists catches_unique_convention
  on public.catches (fursuit_id, catcher_id, convention_id)
  where status in ('ACCEPTED', 'PENDING')
    and convention_id is not null;

create unique index if not exists catches_unique_global
  on public.catches (fursuit_id, catcher_id)
  where status in ('ACCEPTED', 'PENDING')
    and convention_id is null;

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
