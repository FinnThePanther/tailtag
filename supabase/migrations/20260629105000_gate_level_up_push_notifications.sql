-- Gate level-up push delivery behind the player leveling UI rollout.

CREATE OR REPLACE FUNCTION public.enqueue_notification_push_job(
  p_notification_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_notification record;
  v_job_id uuid;
BEGIN
  IF p_notification_id IS NULL THEN
    RAISE EXCEPTION 'Missing notification id';
  END IF;

  SELECT n.id, n.user_id, n.type, coalesce(n.payload, '{}'::jsonb) AS payload
    INTO v_notification
    FROM public.notifications n
   WHERE n.id = p_notification_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;

  IF v_notification.type = 'level_up'
     AND NOT public.is_feature_enabled_for_profile('player_leveling_ui', v_notification.user_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notification_push_jobs (
    notification_id,
    user_id,
    notification_type,
    payload,
    status,
    next_attempt_at
  )
  VALUES (
    v_notification.id,
    v_notification.user_id,
    v_notification.type,
    v_notification.payload,
    'pending',
    now()
  )
  ON CONFLICT (notification_id) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    SELECT j.id
      INTO v_job_id
      FROM public.notification_push_jobs j
     WHERE j.notification_id = p_notification_id;
  END IF;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification_push_job(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification_push_job(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_send_push_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  v_job_id := public.enqueue_notification_push_job(NEW.id);

  IF v_job_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.invoke_edge_function(
    'send-push',
    jsonb_build_object(
      'notification_id', NEW.id,
      'source', 'notification_insert',
      'maxJobs', 1,
      'maxDurationMs', 2500
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_send_push_trigger()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_send_push_trigger()
  TO service_role;
