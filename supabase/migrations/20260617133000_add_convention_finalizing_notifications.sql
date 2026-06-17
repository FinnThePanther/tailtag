-- Notify convention attendees when a convention enters the finalizing grace
-- window, and keep gallery catchability tied to the closeout deadline.

CREATE UNIQUE INDEX IF NOT EXISTS notifications_convention_finalizing_started_once_idx
  ON public.notifications (user_id, (payload->>'convention_id'))
  WHERE type = 'convention_finalizing_started'
    AND payload ? 'convention_id';

CREATE OR REPLACE FUNCTION public.transition_ended_conventions_to_finalizing(
  p_now timestamp with time zone DEFAULT now()
)
RETURNS TABLE (
  convention_id uuid,
  finalizing_started_at timestamp with time zone,
  closeout_not_before timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT
      c.id,
      c.name,
      public.calculate_convention_closeout_not_before(c.end_date, c.timezone) AS calculated_closeout_not_before
    FROM public.conventions c
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        (
          SELECT timezone_info.name
          FROM pg_timezone_names timezone_info
          WHERE timezone_info.name = NULLIF(btrim(c.timezone), '')
          LIMIT 1
        ),
        'UTC'
      ) AS effective_timezone
    ) tz
    CROSS JOIN LATERAL (
      SELECT timezone(tz.effective_timezone, p_now)::date AS local_day
    ) info
    WHERE c.status = 'live'
      AND c.end_date IS NOT NULL
      AND info.local_day > c.end_date
    FOR UPDATE OF c SKIP LOCKED
  ),
  transitioned AS (
    UPDATE public.conventions c
       SET status = 'finalizing',
           finalizing_started_at = p_now,
           closeout_not_before = candidates.calculated_closeout_not_before,
           closeout_started_at = NULL,
           closeout_completed_at = NULL,
           closeout_last_attempt_at = NULL,
           closeout_step = NULL,
           closeout_retry_count = 0,
           closeout_error = NULL
      FROM candidates
     WHERE c.id = candidates.id
     RETURNING c.id, c.name, c.finalizing_started_at, c.closeout_not_before
  ),
  notification_targets AS (
    SELECT
      pc.profile_id AS user_id,
      transitioned.id AS convention_id,
      transitioned.name AS convention_name,
      transitioned.closeout_not_before
    FROM transitioned
    JOIN public.profile_conventions pc
      ON pc.convention_id = transitioned.id
     AND pc.attendance_state = 'active'
     AND pc.active_until IS NULL
  ),
  notifications_inserted AS (
    INSERT INTO public.notifications (user_id, type, payload)
    SELECT
      target.user_id,
      'convention_finalizing_started',
      jsonb_strip_nulls(
        jsonb_build_object(
          'convention_id', target.convention_id,
          'convention_name', NULLIF(target.convention_name, ''),
          'closeout_not_before', target.closeout_not_before
        )
      )
    FROM notification_targets target
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT transitioned.id, transitioned.finalizing_started_at, transitioned.closeout_not_before
  FROM transitioned
  CROSS JOIN (SELECT count(*) FROM notifications_inserted) notification_insert_count
  ORDER BY transitioned.closeout_not_before NULLS LAST, transitioned.id;
END;
$$;

COMMENT ON FUNCTION public.transition_ended_conventions_to_finalizing(timestamp with time zone) IS
  'Transitions ended live conventions into finalizing, calculates their closeout deadline, and sends convention finalizing reminders.';

CREATE OR REPLACE FUNCTION public.is_convention_gallery_catchable(p_convention_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE((
    SELECT
      c.status IN ('live', 'finalizing')
      AND (c.start_date IS NULL OR info.local_day >= c.start_date)
      AND (
        (
          c.status = 'live'
          AND (c.end_date IS NULL OR info.local_day <= c.end_date)
        )
        OR (
          c.status = 'finalizing'
          AND c.closeout_not_before IS NOT NULL
          AND now() < c.closeout_not_before
        )
      )
    FROM public.conventions c
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        (
          SELECT timezone_info.name
          FROM pg_timezone_names timezone_info
          WHERE timezone_info.name = NULLIF(btrim(c.timezone), '')
          LIMIT 1
        ),
        'UTC'
      ) AS effective_timezone
    ) tz
    CROSS JOIN LATERAL (
      SELECT timezone(tz.effective_timezone, now())::date AS local_day
    ) info
    WHERE c.id = p_convention_id
  ), false);
$$;

GRANT EXECUTE ON FUNCTION public.is_convention_gallery_catchable(uuid)
  TO authenticated, service_role;
