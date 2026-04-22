-- Expose a safe signal for whether the current user has a password credential.
create or replace function public.current_user_has_password_credential()
returns boolean
language plpgsql
stable
security definer
set search_path to 'auth', 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from auth.users u
    where u.id = v_user_id
      and coalesce(u.encrypted_password, '') <> ''
  );
end;
$function$;

revoke all on function public.current_user_has_password_credential() from public;
grant execute on function public.current_user_has_password_credential() to authenticated;
grant execute on function public.current_user_has_password_credential() to service_role;
