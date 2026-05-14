-- Let already-shipped clients create fursuits even if they still try to roster
-- the new suit into closed/past convention memberships.
create or replace function public.enforce_joinable_fursuit_convention()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner_id uuid;
  v_convention_exists boolean;
begin
  select f.owner_id
    into v_owner_id
    from public.fursuits f
   where f.id = new.fursuit_id;

  if v_owner_id is null then
    raise exception 'Fursuit not found';
  end if;

  select exists (
    select 1
      from public.conventions c
     where c.id = new.convention_id
  )
  into v_convention_exists;

  if not v_convention_exists then
    raise exception 'Convention not found';
  end if;

  if not exists (
    select 1
      from public.profile_conventions pc
     where pc.profile_id = v_owner_id
       and pc.convention_id = new.convention_id
  ) then
    raise exception 'Fursuit owner must join the convention before assigning this fursuit';
  end if;

  if not public.is_convention_prejoinable(new.convention_id) then
    if tg_op = 'INSERT' then
      return null;
    end if;

    raise exception 'Convention is not open for registration';
  end if;

  return new;
end;
$$;
