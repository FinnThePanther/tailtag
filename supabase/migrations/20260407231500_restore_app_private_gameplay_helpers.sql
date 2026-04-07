create schema if not exists app_private;

revoke all on schema app_private from public;

create or replace function app_private.edge_function_config_value(
  p_function_name text,
  p_fallback jsonb default null::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (
      select case
        when jsonb_typeof(config) = 'object' and config ? 'value' then config->'value'
        else config
      end
      from public.edge_function_config
      where function_name = p_function_name
      limit 1
    ),
    p_fallback
  );
$$;

create or replace function app_private.ingest_gameplay_event(
  p_type text,
  p_user_id uuid,
  p_convention_id uuid,
  p_payload jsonb,
  p_occurred_at timestamp with time zone,
  p_idempotency_key text default null::text
)
returns table(event_id uuid, duplicate boolean, enqueued boolean)
language plpgsql
security definer
set search_path to 'public', 'pgmq', 'pg_temp'
as $$
declare
  v_event_id uuid;
  v_queue_enabled boolean := coalesce(
    (app_private.edge_function_config_value('gameplay_queue_enabled', 'true'::jsonb))::text::boolean,
    true
  );
  v_queue_message_id bigint;
  v_already_enqueued boolean := false;
begin
  if p_user_id is null then
    raise exception 'Missing user_id';
  end if;

  if p_type is null or char_length(btrim(p_type)) = 0 then
    raise exception 'Missing event type';
  end if;

  if not public.is_valid_event_type(p_type) then
    raise exception 'Unsupported event type: %', p_type;
  end if;

  if p_idempotency_key is not null and btrim(p_idempotency_key) <> '' then
    select
      e.event_id,
      (e.queue_name is not null and e.queue_message_id is not null)
    into
      v_event_id,
      v_already_enqueued
    from public.events e
    where e.idempotency_key = p_idempotency_key
    limit 1;

    if found then
      return query
      select v_event_id, true, v_already_enqueued;
      return;
    end if;
  end if;

  insert into public.events (
    user_id,
    convention_id,
    type,
    payload,
    occurred_at,
    idempotency_key
  )
  values (
    p_user_id,
    p_convention_id,
    p_type,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_occurred_at, timezone('utc'::text, now())),
    nullif(btrim(p_idempotency_key), '')
  )
  returning events.event_id
  into v_event_id;

  if v_queue_enabled then
    if not exists (
      select 1
      from pgmq.list_queues()
      where queue_name = 'gameplay_event_processing'
    ) then
      perform pgmq.create('gameplay_event_processing');
    end if;

    select *
    into v_queue_message_id
    from pgmq.send(
      'gameplay_event_processing',
      jsonb_build_object('event_id', v_event_id)
    );

    update public.events
    set
      queue_name = 'gameplay_event_processing',
      queue_message_id = v_queue_message_id,
      enqueued_at = timezone('utc'::text, now())
    where events.event_id = v_event_id;

    return query
    select v_event_id, false, true;
    return;
  end if;

  return query
  select v_event_id, false, false;
  return;
exception
  when unique_violation then
    if p_idempotency_key is not null and btrim(p_idempotency_key) <> '' then
      select
        e.event_id,
        (e.queue_name is not null and e.queue_message_id is not null)
      into
        v_event_id,
        v_already_enqueued
      from public.events e
      where e.idempotency_key = p_idempotency_key
      limit 1;

      if found then
        return query
        select v_event_id, true, v_already_enqueued;
        return;
      end if;
    end if;

    raise;
end;
$$;
