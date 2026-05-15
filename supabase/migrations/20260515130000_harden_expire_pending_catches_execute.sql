revoke execute on function public.expire_pending_catches() from public, anon, authenticated;

grant execute on function public.expire_pending_catches() to service_role;
