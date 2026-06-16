create or replace function public.replay_gameplay_dead_letter_events(
  p_event_ids uuid[],
  p_actor_id uuid,
  p_reason text
)
returns table(
  event_id uuid,
  replayed boolean,
  status text,
  message text,
  queue_message_id bigint
)
language plpgsql
security definer
set search_path to 'public', 'pgmq', 'pg_temp'
as $$
declare
  v_event_id uuid;
  v_event public.events%rowtype;
  v_queue_message_id bigint;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now timestamp with time zone;
  v_queue_enabled boolean := coalesce(
    (app_private.backend_runtime_config_value('gameplay_queue_enabled', 'true'::jsonb))::text::boolean,
    true
  );
  v_batch_event_ids jsonb;
  v_previous_failure jsonb;
  v_replay_status text;
  v_replay_message text;
  v_replayed boolean;
begin
  if p_actor_id is null then
    raise exception 'Missing actor id';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_id
      and p.role in ('owner', 'organizer')
  ) then
    raise exception 'Actor is not allowed to replay gameplay dead letters';
  end if;

  if v_reason is null then
    raise exception 'Replay reason is required';
  end if;

  if p_event_ids is null or cardinality(p_event_ids) = 0 then
    raise exception 'At least one event id is required';
  end if;

  select to_jsonb(array_agg(distinct event_ids.event_id order by event_ids.event_id))
  into v_batch_event_ids
  from unnest(p_event_ids) as event_ids(event_id);

  for v_event_id in
    select distinct event_ids.event_id
    from unnest(p_event_ids) as event_ids(event_id)
    where event_ids.event_id is not null
    order by event_ids.event_id
  loop
    v_now := timezone('utc'::text, now());
    v_queue_message_id := null;
    v_previous_failure := null;
    v_replay_status := 'skipped_missing';
    v_replay_message := 'Event was not found.';
    v_replayed := false;

    select *
    into v_event
    from public.events e
    where e.event_id = v_event_id
    for update;

    if found then
      v_previous_failure := jsonb_build_object(
        'dead_lettered_at', v_event.dead_lettered_at,
        'dead_letter_reason', v_event.dead_letter_reason,
        'last_error', v_event.last_error,
        'retry_count', v_event.retry_count,
        'queue_name', v_event.queue_name,
        'queue_message_id', v_event.queue_message_id,
        'enqueued_at', v_event.enqueued_at,
        'last_attempted_at', v_event.last_attempted_at
      );

      if v_event.processed_at is not null then
        v_replay_status := 'skipped_processed';
        v_replay_message := 'Event is already processed.';
      elsif v_event.dead_lettered_at is null then
        v_replay_status := 'skipped_not_dead_lettered';
        v_replay_message := 'Event is not currently dead-lettered.';
      elsif not public.is_valid_event_type(v_event.type) then
        v_replay_status := 'skipped_invalid_event_type';
        v_replay_message := 'Event type is no longer supported.';
      elsif not v_queue_enabled then
        v_replay_status := 'skipped_queue_disabled';
        v_replay_message := 'Gameplay queue processing is disabled.';
      elsif exists (
        select 1
        from pgmq.q_gameplay_event_processing q
        where q.message->>'event_id' = v_event_id::text
        limit 1
      ) then
        v_replay_status := 'skipped_already_queued';
        v_replay_message := 'Event already has an active queue message.';
      else
        if not exists (
          select 1
          from pgmq.list_queues()
          where queue_name = 'gameplay_event_processing'
        ) then
          begin
            perform pgmq.create('gameplay_event_processing');
          exception
            when duplicate_table or unique_violation then
              null;
            when raise_exception then
              if sqlerrm ilike '%already exists%' then
                null;
              else
                raise;
              end if;
          end;
        end if;

        select *
        into v_queue_message_id
        from pgmq.send(
          'gameplay_event_processing',
          jsonb_build_object(
            'event_id', v_event_id,
            'replayed_at', v_now,
            'replayed_by', p_actor_id
          )
        );

        update public.events
        set
          queue_name = 'gameplay_event_processing',
          queue_message_id = v_queue_message_id,
          enqueued_at = v_now,
          retry_count = 0,
          last_attempted_at = null,
          last_error = null,
          dead_lettered_at = null,
          dead_letter_reason = null
        where events.event_id = v_event_id;

        v_replay_status := 'replayed';
        v_replay_message := 'Event was requeued for gameplay processing.';
        v_replayed := true;
      end if;
    end if;

    insert into public.audit_log (
      actor_id,
      action,
      entity_type,
      entity_id,
      diff,
      context
    )
    values (
      p_actor_id,
      'replay_gameplay_dead_letter_event',
      'event',
      v_event_id,
      jsonb_build_object(
        'before', v_previous_failure,
        'after', jsonb_build_object(
          'queue_name', case when v_replayed then 'gameplay_event_processing' else v_event.queue_name end,
          'queue_message_id', case when v_replayed then v_queue_message_id else v_event.queue_message_id end,
          'enqueued_at', case when v_replayed then v_now else v_event.enqueued_at end,
          'retry_count', case when v_replayed then 0 else v_event.retry_count end,
          'last_error', case when v_replayed then null else v_event.last_error end,
          'dead_lettered_at', case when v_replayed then null else v_event.dead_lettered_at end,
          'dead_letter_reason', case when v_replayed then null else v_event.dead_letter_reason end
        )
      ),
      jsonb_build_object(
        'reason', v_reason,
        'batch_event_ids', v_batch_event_ids,
        'previous_failure', v_previous_failure,
        'replay_result', jsonb_build_object(
          'status', v_replay_status,
          'message', v_replay_message,
          'replayed', v_replayed,
          'queue_message_id', v_queue_message_id
        )
      )
    );

    event_id := v_event_id;
    replayed := v_replayed;
    status := v_replay_status;
    message := v_replay_message;
    queue_message_id := v_queue_message_id;
    return next;
  end loop;
end;
$$;

revoke all on function public.replay_gameplay_dead_letter_events(uuid[], uuid, text) from public;
revoke all on function public.replay_gameplay_dead_letter_events(uuid[], uuid, text) from anon;
revoke all on function public.replay_gameplay_dead_letter_events(uuid[], uuid, text) from authenticated;
grant execute on function public.replay_gameplay_dead_letter_events(uuid[], uuid, text) to service_role;
