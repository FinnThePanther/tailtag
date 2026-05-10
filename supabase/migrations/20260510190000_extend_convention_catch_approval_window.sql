-- Extend convention catch approval through two full local days after the
-- convention's last day, and delay automated recap closeout to match.

create or replace function public.calculate_catch_expiration(convention_id_param uuid)
returns timestamp with time zone
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  conv_timezone text;
  conv_end_date date;
  expiration_time timestamptz;
begin
  select coalesce(nullif(timezone, ''), 'UTC'), end_date
    into conv_timezone, conv_end_date
    from public.conventions
   where id = convention_id_param;

  if conv_end_date is null or conv_timezone is null then
    return now() + interval '48 hours';
  end if;

  expiration_time := (
    (conv_end_date + interval '3 days' - interval '1 second')
    at time zone conv_timezone
  );

  if expiration_time < now() then
    return now() + interval '48 hours';
  end if;

  return expiration_time;
end;
$function$;

with catch_expirations as (
  select
    c.id,
    (
      (cv.end_date + interval '3 days' - interval '1 second')
      at time zone coalesce(nullif(cv.timezone, ''), 'UTC')
    ) as extended_expires_at
  from public.catches c
  join public.conventions cv on cv.id = c.convention_id
  where c.status = 'PENDING'
    and c.convention_id is not null
    and cv.end_date is not null
    and c.expires_at is not null
)
update public.catches c
   set expires_at = ce.extended_expires_at
  from catch_expirations ce
 where c.id = ce.id
   and c.expires_at < ce.extended_expires_at;

create or replace function app_private.convention_lifecycle_automation_job()
returns void
language plpgsql
security definer
set search_path to 'app_private', 'public', 'extensions'
as $$
declare
  v_supabase_url text;
  v_service_role_key text;
  v_closeout_url text;
  v_headers jsonb;
  convention record;
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
      and info.local_now::date > c.end_date + 2
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
