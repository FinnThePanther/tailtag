-- Phase 7 convention lifecycle automation.
--
-- This job intentionally does not auto-start scheduled conventions. It only
-- closes ended live conventions after a local 6 AM grace point and retries
-- failed or interrupted closeouts with caps.

create or replace function app_private.convention_lifecycle_automation_job()
returns void
language plpgsql
security definer
set search_path to 'app_private', 'public', 'extensions'
as $$
declare
  v_supabase_url     text;
  v_service_role_key text;
  v_actor_id_text    text;
  v_actor_id         uuid;
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

  select decrypted_secret
    into v_actor_id_text
    from vault.decrypted_secrets
   where name in ('LIFECYCLE_AUTOMATION_ACTOR_ID', 'SYSTEM_EVENT_USER_ID', 'system_event_user_id')
   order by
     case name
       when 'LIFECYCLE_AUTOMATION_ACTOR_ID' then 1
       when 'SYSTEM_EVENT_USER_ID' then 2
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

  if v_actor_id_text is null or v_actor_id_text = '' then
    raise warning 'convention_lifecycle_automation_job: missing automation actor vault secret LIFECYCLE_AUTOMATION_ACTOR_ID';
    return;
  end if;

  begin
    v_actor_id := v_actor_id_text::uuid;
  exception
    when invalid_text_representation then
      raise warning 'convention_lifecycle_automation_job: automation actor id is not a valid uuid';
      return;
  end;

  if not exists (select 1 from public.profiles p where p.id = v_actor_id) then
    raise warning 'convention_lifecycle_automation_job: automation actor profile % does not exist', v_actor_id;
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
          'actor_id', v_actor_id::text,
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

do $$
declare
  v_job_id bigint;
begin
  select j.jobid
    into v_job_id
    from cron.job j
   where j.jobname = 'convention-lifecycle-automation'
   limit 1;

  if v_job_id is not null then
    perform cron.alter_job(
      v_job_id,
      schedule := '17 * * * *',
      command  := 'select app_private.convention_lifecycle_automation_job();'
    );
  else
    perform cron.schedule(
      'convention-lifecycle-automation',
      '17 * * * *',
      'select app_private.convention_lifecycle_automation_job();'
    );
  end if;
end;
$$;
