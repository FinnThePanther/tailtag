-- Ensure gameplay queue wakeups are not blocked by convention date windows.
-- Catch confirmations and non-convention events should still process immediately
-- whenever queue backlog exists.

create or replace function public.process_gameplay_queue_if_active()
returns void
language plpgsql
security definer
set search_path to 'public', 'vault'
as $function$
declare
  has_backlog boolean;
  v_url text;
  v_key text;
  v_queue_enabled boolean;
begin
  v_queue_enabled := coalesce(
    (app_private.edge_function_config_value('gameplay_queue_enabled', 'true'::jsonb))::text::boolean,
    true
  );

  if not v_queue_enabled then
    return;
  end if;

  select public.has_visible_gameplay_event_queue_messages() into has_backlog;

  if not has_backlog then
    return;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'SUPABASE_URL'
  order by created_at desc
  limit 1;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'SERVICE_ROLE_KEY'
  order by created_at desc
  limit 1;

  if v_key is null then
    select decrypted_secret into v_key
    from vault.decrypted_secrets
    where name = 'SUPABASE_SERVICE_ROLE_KEY'
    order by created_at desc
    limit 1;
  end if;

  if v_url is null or v_key is null then
    raise warning 'process_gameplay_queue_if_active: missing vault secrets SUPABASE_URL or SERVICE_ROLE_KEY';
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/process-gameplay-queue',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$function$;
