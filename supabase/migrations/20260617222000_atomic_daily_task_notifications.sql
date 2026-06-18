CREATE OR REPLACE FUNCTION public.persist_daily_task_state_and_notifications(
  p_progress_rows jsonb,
  p_streak jsonb,
  p_notifications jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  progress_row jsonb;
  notification_row jsonb;
BEGIN
  IF p_progress_rows IS NULL OR jsonb_typeof(p_progress_rows) <> 'array' THEN
    RAISE EXCEPTION 'Daily task progress rows must be a JSON array';
  END IF;

  IF p_notifications IS NULL OR jsonb_typeof(p_notifications) <> 'array' THEN
    RAISE EXCEPTION 'Daily task notifications must be a JSON array';
  END IF;

  FOR progress_row IN
    SELECT value FROM jsonb_array_elements(p_progress_rows)
  LOOP
    INSERT INTO public.user_daily_progress (
      user_id,
      convention_id,
      day,
      task_id,
      current_count,
      is_completed,
      completed_at
    )
    VALUES (
      (progress_row ->> 'user_id')::uuid,
      (progress_row ->> 'convention_id')::uuid,
      (progress_row ->> 'day')::date,
      (progress_row ->> 'task_id')::uuid,
      (progress_row ->> 'current_count')::integer,
      (progress_row ->> 'is_completed')::boolean,
      nullif(progress_row ->> 'completed_at', '')::timestamptz
    )
    ON CONFLICT (user_id, convention_id, day, task_id)
    DO UPDATE SET
      current_count = EXCLUDED.current_count,
      is_completed = EXCLUDED.is_completed,
      completed_at = EXCLUDED.completed_at;
  END LOOP;

  IF p_streak IS NOT NULL AND p_streak <> 'null'::jsonb THEN
    IF jsonb_typeof(p_streak) <> 'object' THEN
      RAISE EXCEPTION 'Daily task streak must be a JSON object';
    END IF;

    INSERT INTO public.user_daily_streaks (
      user_id,
      convention_id,
      current_streak,
      best_streak,
      last_completed_day
    )
    VALUES (
      (p_streak ->> 'user_id')::uuid,
      (p_streak ->> 'convention_id')::uuid,
      (p_streak ->> 'current_streak')::integer,
      (p_streak ->> 'best_streak')::integer,
      (p_streak ->> 'last_completed_day')::date
    )
    ON CONFLICT (user_id, convention_id)
    DO UPDATE SET
      current_streak = EXCLUDED.current_streak,
      best_streak = EXCLUDED.best_streak,
      last_completed_day = EXCLUDED.last_completed_day;
  END IF;

  FOR notification_row IN
    SELECT value FROM jsonb_array_elements(p_notifications)
  LOOP
    PERFORM *
    FROM public.insert_notification_once(
      (notification_row ->> 'user_id')::uuid,
      notification_row ->> 'type',
      coalesce(notification_row -> 'payload', '{}'::jsonb),
      notification_row ->> 'dedupe_key'
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.persist_daily_task_state_and_notifications(jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_daily_task_state_and_notifications(jsonb, jsonb, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.persist_daily_task_state_and_notifications(jsonb, jsonb, jsonb) IS
  'Atomically persists daily task progress, optional streak state, and idempotent daily task notifications.';
