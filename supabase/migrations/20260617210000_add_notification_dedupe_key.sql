ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_dedupe_key_check'
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_dedupe_key_check
      CHECK (dedupe_key IS NULL OR char_length(btrim(dedupe_key)) > 0) NOT VALID;
  END IF;
END;
$$;

WITH notification_dedupe_candidates AS (
  SELECT
    id,
    user_id,
    type,
    created_at,
    CASE
      WHEN type = 'achievement_awarded'
        AND nullif(payload ->> 'source_event_id', '') IS NOT NULL
        AND coalesce(
          nullif(payload #>> '{context,source_achievement_key}', ''),
          nullif(payload ->> 'achievement_key', ''),
          nullif(payload ->> 'achievement_id', '')
        ) IS NOT NULL
      THEN concat(
        'achievement:',
        nullif(payload ->> 'source_event_id', ''),
        ':',
        coalesce(
          nullif(payload #>> '{context,source_achievement_key}', ''),
          nullif(payload ->> 'achievement_key', ''),
          nullif(payload ->> 'achievement_id', '')
        )
      )
      WHEN type = 'daily_task_completed'
        AND nullif(payload ->> 'convention_id', '') IS NOT NULL
        AND nullif(payload ->> 'day', '') IS NOT NULL
        AND nullif(payload ->> 'task_id', '') IS NOT NULL
      THEN concat(
        'daily-task:',
        nullif(payload ->> 'convention_id', ''),
        ':',
        nullif(payload ->> 'day', ''),
        ':',
        nullif(payload ->> 'task_id', '')
      )
      WHEN type = 'daily_all_complete'
        AND nullif(payload ->> 'convention_id', '') IS NOT NULL
        AND nullif(payload ->> 'day', '') IS NOT NULL
      THEN concat(
        'daily-all-complete:',
        nullif(payload ->> 'convention_id', ''),
        ':',
        nullif(payload ->> 'day', '')
      )
      ELSE NULL
    END AS dedupe_key
  FROM public.notifications
  WHERE type IN ('achievement_awarded', 'daily_task_completed', 'daily_all_complete')
),
ranked_duplicate_notifications AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, type, dedupe_key
      ORDER BY created_at ASC, id ASC
    ) AS duplicate_rank
  FROM notification_dedupe_candidates
  WHERE dedupe_key IS NOT NULL
)
DELETE FROM public.notifications n
USING ranked_duplicate_notifications ranked
WHERE n.id = ranked.id
  AND ranked.duplicate_rank > 1;

UPDATE public.notifications
SET dedupe_key = CASE
  WHEN type = 'achievement_awarded'
  THEN concat(
    'achievement:',
    coalesce(nullif(payload ->> 'source_event_id', ''), id::text),
    ':',
    coalesce(
      nullif(payload #>> '{context,source_achievement_key}', ''),
      nullif(payload ->> 'achievement_key', ''),
      nullif(payload ->> 'achievement_id', ''),
      id::text
    )
  )
  WHEN type = 'daily_task_completed'
    AND nullif(payload ->> 'convention_id', '') IS NOT NULL
    AND nullif(payload ->> 'day', '') IS NOT NULL
    AND nullif(payload ->> 'task_id', '') IS NOT NULL
  THEN concat(
    'daily-task:',
    nullif(payload ->> 'convention_id', ''),
    ':',
    nullif(payload ->> 'day', ''),
    ':',
    nullif(payload ->> 'task_id', '')
  )
  WHEN type = 'daily_task_completed'
  THEN concat('daily-task:legacy:', id::text)
  WHEN type = 'daily_all_complete'
    AND nullif(payload ->> 'convention_id', '') IS NOT NULL
    AND nullif(payload ->> 'day', '') IS NOT NULL
  THEN concat(
    'daily-all-complete:',
    nullif(payload ->> 'convention_id', ''),
    ':',
    nullif(payload ->> 'day', '')
  )
  WHEN type = 'daily_all_complete'
  THEN concat('daily-all-complete:legacy:', id::text)
  ELSE dedupe_key
END
WHERE dedupe_key IS NULL
  AND type IN ('achievement_awarded', 'daily_task_completed', 'daily_all_complete');

ALTER TABLE public.notifications
  VALIDATE CONSTRAINT notifications_dedupe_key_check;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_type_dedupe_key_once_idx
  ON public.notifications (user_id, type, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.insert_notification_once(
  p_user_id uuid,
  p_type text,
  p_payload jsonb,
  p_dedupe_key text
)
RETURNS TABLE(notification_id uuid, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_dedupe_key text := nullif(btrim(p_dedupe_key), '');
  v_inserted_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing notification user_id';
  END IF;

  IF p_type IS NULL OR char_length(btrim(p_type)) = 0 THEN
    RAISE EXCEPTION 'Missing notification type';
  END IF;

  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'Missing notification payload';
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    payload,
    dedupe_key
  )
  VALUES (
    p_user_id,
    btrim(p_type),
    p_payload,
    v_dedupe_key
  )
  ON CONFLICT (
    user_id,
    type,
    dedupe_key
  )
  WHERE dedupe_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    RETURN QUERY SELECT v_inserted_id, true;
    RETURN;
  END IF;

  IF v_dedupe_key IS NOT NULL THEN
    RETURN QUERY
    SELECT n.id, false
    FROM public.notifications n
    WHERE n.user_id = p_user_id
      AND n.type = btrim(p_type)
      AND n.dedupe_key = v_dedupe_key
    ORDER BY n.created_at ASC, n.id ASC
    LIMIT 1;
    RETURN;
  END IF;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_notification_once(uuid, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_notification_once(uuid, text, jsonb, text)
  TO service_role;

COMMENT ON COLUMN public.notifications.dedupe_key IS
  'Optional stable notification identity used to make notification creation idempotent.';

COMMENT ON FUNCTION public.insert_notification_once(uuid, text, jsonb, text) IS
  'Creates one notification per user, type, and non-null dedupe key, returning the existing notification when already present.';
