-- Phase 2 convention lifecycle safety: only rotate daily tasks for live conventions.

create or replace function app_private.rotate_daily_assignments_job()
returns void
language plpgsql
security definer
set search_path to 'app_private', 'public', 'extensions'
as $$
declare
  v_supabase_url     text;
  v_service_role_key text;
  v_rotate_url       text;
  v_headers          jsonb;
  convention         record;
begin
  select decrypted_secret
    into v_supabase_url
    from vault.decrypted_secrets
   where name = 'SUPABASE_URL'
   order by created_at desc
   limit 1;

  if v_supabase_url is null or v_supabase_url = '' then
    raise exception 'Vault secret "SUPABASE_URL" is not set';
  end if;

  select decrypted_secret
    into v_service_role_key
    from vault.decrypted_secrets
   where name = 'rotate_dailys_service_role_key'
   order by created_at desc
   limit 1;

  if v_service_role_key is null or v_service_role_key = '' then
    raise exception 'Vault secret "rotate_dailys_service_role_key" is not set';
  end if;

  v_rotate_url := rtrim(v_supabase_url, '/') || '/functions/v1/rotate-dailys';

  v_headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || v_service_role_key
  );

  for convention in
    select
      c.id,
      info.local_day
    from public.conventions c
    cross join lateral (
      select timezone(coalesce(nullif(c.timezone, ''), 'UTC'), now())::date as local_day
    ) info
    where c.status = 'live'
      and (c.start_date is null or info.local_day >= c.start_date)
      and (c.end_date is null or info.local_day <= c.end_date)
  loop
    if exists (
      select 1
      from public.daily_assignments da
      where da.convention_id = convention.id
        and da.day = convention.local_day
    ) then
      continue;
    end if;

    begin
      perform net.http_post(
        url                  := v_rotate_url || '?convention_id=' || convention.id::text || '&source=cron',
        headers              := v_headers,
        timeout_milliseconds := 10000
      );
    exception
      when others then
        raise warning 'rotate-dailys cron failed for convention %: %', convention.id, sqlerrm;
    end;
  end loop;
end;
$$;
