-- Backfill Double Trouble for players who already had two accepted catches
-- within 60 seconds before the achievement timing check was corrected.
with double_trouble as (
  select id
  from public.achievements
  where key = 'DOUBLE_TROUBLE'
    and is_active = true
  limit 1
),
accepted_catches as (
  select
    id,
    catcher_id,
    fursuit_id,
    convention_id,
    caught_at
  from public.catches
  where status = 'ACCEPTED'
    and is_tutorial = false
    and caught_at is not null
),
qualifying_pairs as (
  select
    c1.id as first_catch_id,
    c2.id as second_catch_id,
    c1.catcher_id,
    c1.fursuit_id as first_fursuit_id,
    c2.fursuit_id as second_fursuit_id,
    c1.convention_id,
    c1.caught_at as first_caught_at,
    c2.caught_at as second_caught_at,
    row_number() over (
      partition by c1.catcher_id
      order by c2.caught_at, c1.caught_at, c1.id, c2.id
    ) as pair_rank
  from accepted_catches c1
  join accepted_catches c2
    on c2.catcher_id = c1.catcher_id
   and c2.id <> c1.id
   and c2.caught_at > c1.caught_at
   and c2.caught_at <= c1.caught_at + interval '60 seconds'
),
selected_pairs as (
  select *
  from qualifying_pairs
  where pair_rank = 1
)
insert into public.user_achievements (
  user_id,
  achievement_id,
  unlocked_at,
  context
)
select
  selected_pairs.catcher_id,
  double_trouble.id,
  selected_pairs.second_caught_at,
  jsonb_build_object(
    'backfilled', true,
    'reason', 'double_trouble_historical_catch_pair',
    'catch_id', selected_pairs.second_catch_id,
    'first_catch_id', selected_pairs.first_catch_id,
    'second_catch_id', selected_pairs.second_catch_id,
    'fursuit_id', selected_pairs.second_fursuit_id,
    'first_fursuit_id', selected_pairs.first_fursuit_id,
    'second_fursuit_id', selected_pairs.second_fursuit_id,
    'convention_id', selected_pairs.convention_id,
    'first_caught_at', selected_pairs.first_caught_at,
    'second_caught_at', selected_pairs.second_caught_at
  )
from selected_pairs
cross join double_trouble
on conflict (user_id, achievement_id) do nothing;
