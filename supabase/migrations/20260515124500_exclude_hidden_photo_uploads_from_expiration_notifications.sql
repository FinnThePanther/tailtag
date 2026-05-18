create or replace function public.expire_pending_catches()
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_expired_catches json;
  v_stale_pending_upload_count integer := 0;
begin
  -- Pending photo-upload catches are hidden from owner approval until the photo
  -- arrives. Expire abandoned rows after a generous retry window without sending
  -- owner-facing expiration notifications for requests they never saw.
  update public.catches c
     set status = 'EXPIRED',
         photo_upload_state = 'failed'
   where c.status = 'PENDING'
     and c.catch_photo_source is not null
     and c.photo_upload_state = 'pending_upload'
     and c.catch_photo_url is null
     and c.caught_at <= now() - interval '72 hours';

  get diagnostics v_stale_pending_upload_count = row_count;

  -- Update all normally expired pending catches and collect their details for notifications.
  with expired as (
    update public.catches c
       set status = 'EXPIRED'
     where c.status = 'PENDING'
       and c.expires_at <= now()
       and (c.catch_photo_source is null or c.catch_photo_url is not null)
     returning
       c.id,
       c.catcher_id,
       c.fursuit_id,
       (select f.name from public.fursuits f where f.id = c.fursuit_id) as fursuit_name,
       (select f.owner_id from public.fursuits f where f.id = c.fursuit_id) as owner_id,
       (select p.username from public.profiles p where p.id = c.catcher_id) as catcher_username
  )
  select json_agg(expired) into v_expired_catches from expired;

  return json_build_object(
    'success', true,
    'expired_count', coalesce(json_array_length(v_expired_catches), 0),
    'stale_pending_upload_count', v_stale_pending_upload_count,
    'expired_catches', coalesce(v_expired_catches, '[]'::json),
    'timestamp', now()
  );
end;
$function$;

revoke execute on function public.expire_pending_catches() from public, anon, authenticated;

grant execute on function public.expire_pending_catches() to service_role;
