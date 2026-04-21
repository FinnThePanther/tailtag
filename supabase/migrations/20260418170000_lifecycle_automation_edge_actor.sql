-- Let the close-out-convention Edge Function resolve the automation actor from
-- Edge Function secrets. The database cron job only needs to find candidates
-- and invoke the function with the correct automation source.

create or replace function app_private.convention_lifecycle_automation_job()
returns void
language plpgsql
security definer
set search_path to 'app_private', 'public', 'extensions'
as $$
declare
  v_supabase_url     text;
  v_service_role_key text;
  v_closeout_url     text;
  v_headers          jsonb;
  convention         record;
begin
  select decrypted_secret
    into v_supabase_url
    from vault.decrypted_secrets
   where name = 'SUPABASE_URL'
   order by created_at desc
   limit 1;

  select decrypted_secret
    into v_service_role_key
    from vault.decrypted_secrets
   where name in ('closeout_service_role_key', 'SERVICE_ROLE_KEY', 'rotate_dailys_service_role_key')
   order by
     case name
       when 'closeout_service_role_key' then 1
       when 'SERVICE_ROLE_KEY' then 2
       else 3
     end,
     created_at desc
   limit 1;

  if v_supabase_url is null or v_supabase_url = '' then
    raise warning 'convention_lifecycle_automation_job: missing vault secret SUPABASE_URL';
    return;
  end if;

  if v_service_role_key is null or v_service_role_key = '' then
    raise warning 'convention_lifecycle_automation_job: missing service role vault secret';
    return;
  end if;

  v_closeout_url := rtrim(v_supabase_url, '/') || '/functions/v1/close-out-convention';
  v_headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || v_service_role_key
  );

  for convention in
    select
      c.id,
      'cron_close'::text as source
    from public.conventions c
    cross join lateral (
      select timezone(coalesce(nullif(c.timezone, ''), 'UTC'), now()) as local_now
    ) info
    where c.status = 'live'
      and c.end_date is not null
      and info.local_now::date > c.end_date
      and info.local_now::time >= time '06:00'
      and not exists (
        select 1
          from public.audit_log al
         where al.entity_type = 'convention'
           and al.entity_id = c.id
           and al.action = 'close_convention_attempt'
           and al.context->>'source' = 'cron_close'
           and al.created_at >= now() - interval '6 hours'
      )

    union all

    select
      c.id,
      'cron_retry'::text as source
    from public.conventions c
    where c.status = 'closed'
      and (c.closeout_error is not null or c.archived_at is null)
      and not exists (
        select 1
          from public.audit_log al
         where al.entity_type = 'convention'
           and al.entity_id = c.id
           and al.action = 'close_convention_attempt'
           and al.context->>'source' = 'cron_retry'
           and al.created_at >= now() - interval '6 hours'
      )
      and (
        select count(*)
          from public.audit_log al
         where al.entity_type = 'convention'
           and al.entity_id = c.id
           and al.action = 'close_convention_attempt'
           and al.context->>'source' = 'cron_retry'
           and al.created_at >= now() - interval '7 days'
      ) < 5
  loop
    begin
      perform net.http_post(
        url                  := v_closeout_url,
        headers              := v_headers,
        body                 := jsonb_build_object(
          'convention_id', convention.id::text,
          'source', convention.source
        ),
        timeout_milliseconds := 10000
      );
    exception
      when others then
        raise warning 'convention lifecycle automation failed for convention %: %', convention.id, sqlerrm;
    end;
  end loop;
end;
$$;
