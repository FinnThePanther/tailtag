create or replace function public.count_distinct_makers_caught_at_convention(
  p_catcher_id uuid,
  p_convention_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select count(distinct fm.normalized_maker_name)::integer
  from public.catches c
  join public.fursuit_makers fm on fm.fursuit_id = c.fursuit_id
  where c.catcher_id = p_catcher_id
    and c.convention_id = p_convention_id
    and c.status = 'ACCEPTED'
    and c.is_tutorial = false
    and btrim(fm.normalized_maker_name) <> '';
$function$;

create or replace function public.count_distinct_self_made_fursuits_caught(
  p_catcher_id uuid,
  p_self_made_aliases text[]
)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select count(distinct c.fursuit_id)::integer
  from public.catches c
  join public.fursuit_makers fm on fm.fursuit_id = c.fursuit_id
  where c.catcher_id = p_catcher_id
    and c.status = 'ACCEPTED'
    and c.is_tutorial = false
    and fm.normalized_maker_name = any(p_self_made_aliases);
$function$;

create or replace function public.has_new_maker_for_catcher_at_convention(
  p_catcher_id uuid,
  p_convention_id uuid,
  p_catch_id uuid,
  p_normalized_maker_names text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with requested_makers as (
    select distinct btrim(value) as normalized_maker_name
    from unnest(p_normalized_maker_names) as value
    where btrim(value) <> ''
  ),
  previous_makers as (
    select distinct fm.normalized_maker_name
    from public.catches c
    join public.fursuit_makers fm on fm.fursuit_id = c.fursuit_id
    where c.catcher_id = p_catcher_id
      and c.convention_id = p_convention_id
      and c.id <> p_catch_id
      and c.status = 'ACCEPTED'
      and c.is_tutorial = false
  )
  select exists (
    select 1
    from requested_makers rm
    where not exists (
      select 1
      from previous_makers pm
      where pm.normalized_maker_name = rm.normalized_maker_name
    )
  );
$function$;

grant execute on function public.count_distinct_makers_caught_at_convention(uuid, uuid) to service_role;
grant execute on function public.count_distinct_self_made_fursuits_caught(uuid, text[]) to service_role;
grant execute on function public.has_new_maker_for_catcher_at_convention(uuid, uuid, uuid, text[]) to service_role;

insert into public.achievement_rules
  (rule_id, kind, slug, name, description, is_active, version, rule, metadata)
values
  (
    'f0229fa6-015b-4b72-a563-90257a6db4ca',
    'permanent',
    'maker_match',
    'MAKER_MATCH',
    'Catch a fursuit from a maker that also made one of your suits.',
    true,
    1,
    '{"event_type":"catch_performed","required_stats":["hasMakerMatchWithCatcherOwnedSuit"]}'::jsonb,
    '{"can_run_client":false,"required_stats":["hasMakerMatchWithCatcherOwnedSuit"],"achievement_key":"MAKER_MATCH"}'::jsonb
  ),
  (
    '738249c7-0b59-43d0-ae31-734787ff3781',
    'permanent',
    'con_floor_collector',
    'CON_FLOOR_COLLECTOR',
    'At one convention, catch fursuits from 5 different makers.',
    true,
    1,
    '{"event_type":"catch_performed","required_stats":["distinctMakersCaughtAtConvention"]}'::jsonb,
    '{"can_run_client":false,"required_stats":["distinctMakersCaughtAtConvention"],"achievement_key":"CON_FLOOR_COLLECTOR"}'::jsonb
  ),
  (
    'dacb8bdd-38bd-4a03-bfd4-ad317e931b18',
    'permanent',
    'self_made_supporter',
    'SELF_MADE_SUPPORTER',
    'Catch 3 distinct self-made fursuits.',
    true,
    1,
    '{"event_type":"catch_performed","required_stats":["distinctSelfMadeFursuitsCaught"]}'::jsonb,
    '{"can_run_client":false,"required_stats":["distinctSelfMadeFursuitsCaught"],"achievement_key":"SELF_MADE_SUPPORTER"}'::jsonb
  )
on conflict (rule_id) do nothing;

insert into public.achievements
  (id, key, name, description, category, recipient_role, trigger_event, is_active, rule_id, reset_mode, reset_timezone, reset_grace_minutes, convention_id)
values
  (
    'ffdb4dd3-86bd-48a7-b901-5613714313c4',
    'MAKER_MATCH',
    'Maker Match',
    'Catch a fursuit from a maker that also made one of your suits.',
    'variety',
    'catcher',
    'catch_performed',
    true,
    'f0229fa6-015b-4b72-a563-90257a6db4ca',
    'none',
    'UTC',
    0,
    null
  ),
  (
    '67c8644f-2dab-442f-9e5d-e8427c909c58',
    'CON_FLOOR_COLLECTOR',
    'Con Floor Collector',
    'At one convention, catch fursuits from 5 different makers.',
    'variety',
    'catcher',
    'catch_performed',
    true,
    '738249c7-0b59-43d0-ae31-734787ff3781',
    'none',
    'UTC',
    0,
    null
  ),
  (
    '09959a69-a8fd-4faa-8744-1ba4bf383aa1',
    'SELF_MADE_SUPPORTER',
    'Self-Made Supporter',
    'Catch 3 distinct self-made fursuits.',
    'variety',
    'catcher',
    'catch_performed',
    true,
    'dacb8bdd-38bd-4a03-bfd4-ad317e931b18',
    'none',
    'UTC',
    0,
    null
  )
on conflict (id) do nothing;

insert into public.daily_tasks
  (id, name, description, kind, requirement, metadata, is_active, rule_id, convention_id)
values
  (
    '8b5f9a7a-8d7d-4e89-9a92-4fd4b45b8b71',
    'Same Studio',
    'Catch a suit from a maker that also made one of yours.',
    'catch',
    1,
    '{"metric":"total","eventType":"catch_performed","includeTutorialCatches":false,"filters":[{"path":"payload.catcher_id","equalsUserId":true},{"path":"payload.has_catcher_owned_maker_match","equals":true}]}'::jsonb,
    true,
    null,
    null
  ),
  (
    '3327bbbe-2c41-421d-ad0b-ed1c3fb22d60',
    'Studio Sampler',
    'Catch suits from two different makers today.',
    'catch',
    2,
    '{"metric":"unique","uniqueBy":"payload.normalized_maker_names","eventType":"catch_performed","includeTutorialCatches":false,"filters":[{"path":"payload.catcher_id","equalsUserId":true},{"path":"payload.has_maker","equals":true}]}'::jsonb,
    true,
    null,
    null
  ),
  (
    'ee1c9130-0db4-48cf-bbb6-64f965a563c7',
    'Fresh Workshop',
    'Catch a maker you have not caught earlier at this convention.',
    'catch',
    1,
    '{"metric":"total","eventType":"catch_performed","includeTutorialCatches":false,"filters":[{"path":"payload.catcher_id","equalsUserId":true},{"path":"payload.is_new_maker_for_catcher_at_convention","equals":true}]}'::jsonb,
    true,
    null,
    null
  )
on conflict (id) do nothing;
