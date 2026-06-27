-- Tune V1 achievement criteria and copy.

UPDATE public.achievement_rules
SET description = 'One of your suits has been caught by 2 unique people.'
WHERE rule_id = 'f1a7b000-0000-4000-8000-000000000001';

UPDATE public.achievements
SET description = 'One of your suits has been caught by 2 unique people.'
WHERE key = 'FIRST_FAN'
  AND convention_id IS NULL;

UPDATE public.achievement_rules
SET description = 'Make a catch from 5:00-9:59 AM local convention time.'
WHERE rule_id = 'f1a7b000-0000-4000-8000-000000000006';

UPDATE public.achievements
SET description = 'Make a catch from 5:00-9:59 AM local convention time.'
WHERE key = 'EARLY_BIRD'
  AND convention_id IS NULL;

WITH first_fan AS (
  SELECT id
  FROM public.achievements
  WHERE key = 'FIRST_FAN'
    AND convention_id IS NULL
    AND is_active = true
  LIMIT 1
),
first_catches_by_catcher AS (
  SELECT
    f.owner_id AS user_id,
    c.fursuit_id,
    c.catcher_id,
    MIN(COALESCE(c.caught_at, now())) AS first_caught_at
  FROM public.catches c
  JOIN public.fursuits f ON f.id = c.fursuit_id
  WHERE c.status = 'ACCEPTED'
    AND f.owner_id IS NOT NULL
    AND c.catcher_id IS DISTINCT FROM f.owner_id
  GROUP BY f.owner_id, c.fursuit_id, c.catcher_id
),
ranked_catches AS (
  SELECT
    user_id,
    fursuit_id,
    catcher_id,
    first_caught_at,
    ROW_NUMBER() OVER (
      PARTITION BY fursuit_id
      ORDER BY first_caught_at ASC, catcher_id ASC
    ) AS catch_rank,
    COUNT(*) OVER (PARTITION BY fursuit_id) AS unique_catchers
  FROM first_catches_by_catcher
),
qualified_first_fan AS (
  SELECT
    user_id,
    fursuit_id,
    unique_catchers,
    MAX(first_caught_at) FILTER (WHERE catch_rank <= 2) AS unlocked_at
  FROM ranked_catches
  WHERE unique_catchers >= 2
  GROUP BY user_id, fursuit_id, unique_catchers
),
ranked_first_fan AS (
  SELECT
    user_id,
    fursuit_id,
    unique_catchers,
    unlocked_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY unlocked_at ASC NULLS LAST, fursuit_id ASC
    ) AS achievement_rank
  FROM qualified_first_fan
)
INSERT INTO public.user_achievements (user_id, achievement_id, unlocked_at, context)
SELECT
  q.user_id,
  first_fan.id,
  COALESCE(q.unlocked_at, now()),
  jsonb_build_object(
    'fursuit_id', q.fursuit_id,
    'unique_catchers_lifetime', q.unique_catchers,
    'source', '20260627120000_tune_v1_achievement_criteria'
  )
FROM ranked_first_fan q
CROSS JOIN first_fan
WHERE q.achievement_rank = 1
ON CONFLICT (user_id, achievement_id) DO NOTHING;
