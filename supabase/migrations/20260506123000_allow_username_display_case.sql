-- Allow usernames to preserve display casing while keeping case-insensitive uniqueness.

alter table public.profiles
  drop constraint if exists profiles_username_format_check;

alter table public.profiles
  add constraint profiles_username_format_check
    check (username is null or username ~ '^[A-Za-z0-9_]{3,15}$');

create or replace function public.is_username_available(
  p_username text,
  p_current_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_candidate text;
begin
  v_candidate := lower(trim(coalesce(p_username, '')));

  if v_candidate = '' then
    return false;
  end if;

  if v_candidate !~ '^[a-z0-9_]{3,15}$' then
    return false;
  end if;

  if position('tailtag' in v_candidate) > 0 or position('admin' in v_candidate) > 0 then
    return false;
  end if;

  return not exists (
    select 1
    from public.profiles p
    where p.username is not null
      and lower(p.username) = v_candidate
      and (p_current_user_id is null or p.id <> p_current_user_id)
  );
end;
$function$;

revoke all on function public.is_username_available(text, uuid) from public;
grant execute on function public.is_username_available(text, uuid) to authenticated;
grant execute on function public.is_username_available(text, uuid) to service_role;
