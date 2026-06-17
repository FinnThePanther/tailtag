WITH achievement_notification_candidates AS (
  SELECT
    id,
    user_id,
    type,
    created_at,
    coalesce(
      nullif(payload ->> 'source_event_id', ''),
      nullif(payload ->> 'awarded_at', '')
    ) AS event_key,
    coalesce(
      nullif(payload #>> '{context,source_achievement_key}', ''),
      nullif(payload ->> 'achievement_key', ''),
      nullif(payload ->> 'achievement_id', '')
    ) AS surface_key
  FROM public.notifications
  WHERE type = 'achievement_awarded'
),
ranked_duplicate_notifications AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, type, event_key, surface_key
      ORDER BY created_at ASC, id ASC
    ) AS duplicate_rank
  FROM achievement_notification_candidates
  WHERE event_key IS NOT NULL
    AND surface_key IS NOT NULL
)
DELETE FROM public.notifications n
USING ranked_duplicate_notifications ranked
WHERE n.id = ranked.id
  AND ranked.duplicate_rank > 1;

UPDATE public.notifications
SET dedupe_key = concat(
  'achievement:',
  coalesce(
    nullif(payload ->> 'source_event_id', ''),
    nullif(payload ->> 'awarded_at', ''),
    id::text
  ),
  ':',
  coalesce(
    nullif(payload #>> '{context,source_achievement_key}', ''),
    nullif(payload ->> 'achievement_key', ''),
    nullif(payload ->> 'achievement_id', ''),
    id::text
  )
)
WHERE type = 'achievement_awarded';
