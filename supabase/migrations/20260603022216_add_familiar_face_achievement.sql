create or replace function public.count_distinct_conventions_for_catcher_fursuit(
  p_catcher_id uuid,
  p_fursuit_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select count(distinct convention_id)::integer
  from public.catches
  where catcher_id = p_catcher_id
    and fursuit_id = p_fursuit_id
    and status = 'ACCEPTED'
    and convention_id is not null;
$function$;

grant execute on function public.count_distinct_conventions_for_catcher_fursuit(uuid, uuid)
  to service_role;

insert into public.achievement_rules
  (rule_id, kind, slug, name, description, is_active, version, rule, metadata)
values
  (
    'a42cbc09-052b-4047-810b-9563b46c4af6',
    'permanent',
    'familiar_face',
    'FAMILIAR_FACE',
    'Catch the same fursuit at 2 different conventions.',
    true,
    1,
    '{"event_type":"catch_performed","required_stats":["distinctConventionsForCatcherFursuit"]}'::jsonb,
    '{"can_run_client":false,"required_stats":["distinctConventionsForCatcherFursuit"],"achievement_key":"FAMILIAR_FACE"}'::jsonb
  )
on conflict (rule_id) do update
set
  kind = excluded.kind,
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  version = excluded.version,
  rule = excluded.rule,
  metadata = excluded.metadata;

insert into public.achievements
  (
    id,
    key,
    name,
    description,
    category,
    recipient_role,
    trigger_event,
    is_active,
    rule_id,
    reset_mode,
    reset_timezone,
    reset_grace_minutes,
    convention_id
  )
values
  (
    '4fe01130-1ba3-40e1-b886-d46b46ef9651',
    'FAMILIAR_FACE',
    'Familiar Face',
    'Catch the same fursuit at 2 different conventions.',
    'dedication',
    'catcher',
    'catch_performed',
    true,
    'a42cbc09-052b-4047-810b-9563b46c4af6',
    'none',
    'UTC',
    0,
    null
  )
on conflict (id) do update
set
  key = excluded.key,
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  recipient_role = excluded.recipient_role,
  trigger_event = excluded.trigger_event,
  is_active = excluded.is_active,
  rule_id = excluded.rule_id,
  reset_mode = excluded.reset_mode,
  reset_timezone = excluded.reset_timezone,
  reset_grace_minutes = excluded.reset_grace_minutes,
  convention_id = excluded.convention_id;

with accepted_catches as (
  select
    c.id,
    c.catcher_id,
    c.fursuit_id,
    c.convention_id,
    c.caught_at,
    row_number() over (
      partition by c.catcher_id, c.fursuit_id, c.convention_id
      order by c.caught_at asc, c.id asc
    ) as convention_catch_rank
  from public.catches c
  where c.status = 'ACCEPTED'
    and c.convention_id is not null
    and c.caught_at is not null
),
first_convention_catches as (
  select
    catcher_id,
    fursuit_id,
    convention_id,
    caught_at
  from accepted_catches
  where convention_catch_rank = 1
),
ranked_conventions as (
  select
    catcher_id,
    fursuit_id,
    convention_id,
    caught_at,
    row_number() over (
      partition by catcher_id, fursuit_id
      order by caught_at asc, convention_id asc
    ) as distinct_convention_rank,
    count(*) over (
      partition by catcher_id, fursuit_id
    ) as distinct_conventions
  from first_convention_catches
),
qualifying_pairs as (
  select
    catcher_id,
    fursuit_id,
    caught_at as unlocked_at,
    distinct_conventions
  from ranked_conventions
  where distinct_convention_rank = 2
    and distinct_conventions >= 2
)
insert into public.user_achievements (
  user_id,
  achievement_id,
  unlocked_at,
  context
)
select
  qp.catcher_id,
  '4fe01130-1ba3-40e1-b886-d46b46ef9651'::uuid,
  qp.unlocked_at,
  jsonb_build_object(
    'fursuit_id', qp.fursuit_id,
    'catcher_id', qp.catcher_id,
    'distinct_conventions', qp.distinct_conventions
  )
from qualifying_pairs qp
on conflict (user_id, achievement_id) do nothing;
