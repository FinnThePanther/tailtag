create or replace function public.leave_convention(
  p_profile_id uuid,
  p_convention_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_is_admin boolean := auth.role() = 'service_role';
begin
  if not v_actor_is_admin then
    v_actor_is_admin := coalesce(public.is_admin(v_actor_id), false);
  end if;

  if auth.role() <> 'service_role' and v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and v_actor_id is distinct from p_profile_id and not v_actor_is_admin then
    raise exception 'Not authorized to leave conventions for this profile';
  end if;

  delete from public.fursuit_conventions fc
  using public.fursuits f
  where fc.fursuit_id = f.id
    and f.owner_id = p_profile_id
    and fc.convention_id = p_convention_id;

  delete from public.profile_conventions pc
  where pc.profile_id = p_profile_id
    and pc.convention_id = p_convention_id;
end;
$$;

grant execute on function public.leave_convention(uuid, uuid) to authenticated, service_role;
