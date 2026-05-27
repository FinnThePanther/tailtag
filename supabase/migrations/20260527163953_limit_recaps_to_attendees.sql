-- Recap eligibility is based on durable convention attendance, not incidental
-- convention-scoped activity such as owning a caught suit.

WITH invalid_recap_notifications AS (
  SELECT n.id
  FROM public.notifications n
  LEFT JOIN public.convention_participant_recaps cpr
    ON cpr.id::text = n.payload ->> 'recap_id'
  WHERE n.type = 'convention_recap_ready'
    AND (
      cpr.id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.profile_conventions pc
        WHERE pc.profile_id = n.user_id
          AND pc.convention_id = cpr.convention_id
          AND pc.attendance_state IN ('active', 'left', 'finalized')
      )
    )
)
DELETE FROM public.notifications n
USING invalid_recap_notifications invalid
WHERE n.id = invalid.id;

WITH invalid_recaps AS (
  SELECT cpr.id
  FROM public.convention_participant_recaps cpr
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.profile_conventions pc
    WHERE pc.profile_id = cpr.profile_id
      AND pc.convention_id = cpr.convention_id
      AND pc.attendance_state IN ('active', 'left', 'finalized')
  )
)
DELETE FROM public.convention_participant_recaps cpr
USING invalid_recaps invalid
WHERE cpr.id = invalid.id;

CREATE OR REPLACE FUNCTION public.get_my_convention_recaps()
RETURNS TABLE (
  recap_id uuid,
  convention_id uuid,
  convention_name text,
  location text,
  start_date date,
  end_date date,
  generated_at timestamp with time zone,
  final_rank integer,
  catch_count integer,
  unique_fursuits_caught_count integer,
  own_fursuits_caught_count integer,
  unique_catchers_for_own_fursuits_count integer,
  daily_tasks_completed_count integer,
  achievements_unlocked_count integer,
  summary jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT
    r.id AS recap_id,
    r.convention_id,
    c.name AS convention_name,
    c.location,
    c.start_date,
    c.end_date,
    r.generated_at,
    r.final_rank,
    r.catch_count,
    r.unique_fursuits_caught_count,
    r.own_fursuits_caught_count,
    r.unique_catchers_for_own_fursuits_count,
    r.daily_tasks_completed_count,
    r.achievements_unlocked_count,
    r.summary
  FROM public.convention_participant_recaps r
  JOIN public.conventions c ON c.id = r.convention_id
  WHERE r.profile_id = (SELECT auth.uid())
    AND c.status = 'archived'
    AND EXISTS (
      SELECT 1
      FROM public.profile_conventions pc
      WHERE pc.profile_id = r.profile_id
        AND pc.convention_id = r.convention_id
        AND pc.attendance_state IN ('active', 'left', 'finalized')
    )
  ORDER BY c.end_date DESC NULLS LAST, r.generated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.insert_convention_recap_ready_notification_once(
  p_user_id uuid,
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_inserted_id uuid;
  v_recap_id uuid;
  v_convention_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing notification user_id';
  END IF;

  IF p_payload IS NULL
    OR p_payload ->> 'recap_id' IS NULL
    OR p_payload ->> 'recap_id' = ''
  THEN
    RAISE EXCEPTION 'Recap notification payload requires recap_id';
  END IF;

  v_recap_id := (p_payload ->> 'recap_id')::uuid;

  SELECT cpr.convention_id
    INTO v_convention_id
  FROM public.convention_participant_recaps cpr
  WHERE cpr.id = v_recap_id
    AND cpr.profile_id = p_user_id;

  IF v_convention_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profile_conventions pc
    WHERE pc.profile_id = p_user_id
      AND pc.convention_id = v_convention_id
      AND pc.attendance_state IN ('active', 'left', 'finalized')
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    payload
  )
  VALUES (
    p_user_id,
    'convention_recap_ready',
    p_payload
  )
  ON CONFLICT (
    user_id,
    type,
    ((payload ->> 'recap_id'))
  )
  WHERE type = 'convention_recap_ready'
    AND payload ->> 'recap_id' IS NOT NULL
    AND payload ->> 'recap_id' <> ''
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  RETURN v_inserted_id IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_convention_recaps() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.insert_convention_recap_ready_notification_once(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_convention_recap_ready_notification_once(uuid, jsonb)
  TO service_role;
