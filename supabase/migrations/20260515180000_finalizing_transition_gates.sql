-- Phase 1.3 convention ending lifecycle finalizing transition and backend gates.
--
-- Ended live conventions now enter a player-visible finalizing state before
-- later closeout phases run. Finalizing keeps cleanup/read-only paths available
-- while blocking new live gameplay and roster mutation.

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
     RETURNING c.id, c.finalizing_started_at, c.closeout_not_before
  )
  SELECT transitioned.id, transitioned.finalizing_started_at, transitioned.closeout_not_before
  FROM transitioned
  ORDER BY transitioned.closeout_not_before NULLS LAST, transitioned.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_ended_conventions_to_finalizing(timestamp with time zone)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_ended_conventions_to_finalizing(timestamp with time zone)
  TO service_role;

COMMENT ON FUNCTION public.transition_ended_conventions_to_finalizing(timestamp with time zone) IS
  'Transitions ended live conventions into finalizing and calculates their closeout deadline.';

CREATE OR REPLACE FUNCTION public.is_convention_prejoinable(p_convention_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE((
    SELECT
      c.status IN ('scheduled', 'live')
      AND (c.end_date IS NULL OR info.local_day <= c.end_date)
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
      AND (c.end_date IS NULL OR info.local_day <= c.end_date + 3)
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

CREATE OR REPLACE FUNCTION public.is_convention_leaderboard_visible(p_convention_id uuid)
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
      AND (c.end_date IS NULL OR info.local_day <= c.end_date + 3)
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

GRANT EXECUTE ON FUNCTION public.is_convention_prejoinable(uuid)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_convention_gallery_catchable(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_convention_leaderboard_visible(uuid)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.leave_convention(
  p_profile_id uuid,
  p_convention_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_is_admin boolean := auth.role() = 'service_role';
BEGIN
  IF auth.role() <> 'service_role' AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT v_actor_is_admin THEN
    v_actor_is_admin := COALESCE(public.is_admin(v_actor_id), false);
  END IF;

  IF auth.role() <> 'service_role' AND v_actor_id IS DISTINCT FROM p_profile_id AND NOT v_actor_is_admin THEN
    RAISE EXCEPTION 'Not authorized to leave conventions for this profile';
  END IF;

  IF NOT public.is_convention_prejoinable(p_convention_id) THEN
    RAISE EXCEPTION 'Convention attendance can no longer be changed';
  END IF;

  UPDATE public.fursuit_conventions fc
     SET roster_state = 'removed',
         removed_at = now(),
         active_until = now(),
         finalized_at = NULL
    FROM public.fursuits f
   WHERE fc.fursuit_id = f.id
     AND f.owner_id = p_profile_id
     AND fc.convention_id = p_convention_id
     AND fc.roster_state = 'active'
     AND fc.active_until IS NULL;

  UPDATE public.profile_conventions pc
     SET attendance_state = 'left',
         left_at = now(),
         removed_at = NULL,
         active_until = now(),
         finalized_at = NULL
   WHERE pc.profile_id = p_profile_id
     AND pc.convention_id = p_convention_id
     AND pc.attendance_state = 'active'
     AND pc.active_until IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_fursuit_from_convention(
  p_fursuit_id uuid,
  p_convention_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_is_admin boolean := auth.role() = 'service_role';
  v_owner_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT v_actor_is_admin THEN
    v_actor_is_admin := COALESCE(public.is_admin(v_actor_id), false);
  END IF;

  SELECT f.owner_id
    INTO v_owner_id
    FROM public.fursuits f
   WHERE f.id = p_fursuit_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Fursuit not found';
  END IF;

  IF auth.role() <> 'service_role' AND v_actor_id IS DISTINCT FROM v_owner_id AND NOT v_actor_is_admin THEN
    RAISE EXCEPTION 'Not authorized to remove this fursuit from the convention';
  END IF;

  IF NOT public.is_convention_prejoinable(p_convention_id) THEN
    RAISE EXCEPTION 'Convention roster can no longer be changed';
  END IF;

  UPDATE public.fursuit_conventions fc
     SET roster_state = 'removed',
         removed_at = now(),
         active_until = now(),
         finalized_at = NULL
   WHERE fc.fursuit_id = p_fursuit_id
     AND fc.convention_id = p_convention_id
     AND fc.roster_state = 'active'
     AND fc.active_until IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_fursuit_from_convention(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_joinable_fursuit_convention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_owner_id uuid;
  v_convention_status text;
BEGIN
  SELECT f.owner_id
    INTO v_owner_id
    FROM public.fursuits f
   WHERE f.id = NEW.fursuit_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Fursuit not found';
  END IF;

  SELECT c.status
    INTO v_convention_status
    FROM public.conventions c
   WHERE c.id = NEW.convention_id;

  IF v_convention_status IS NULL THEN
    RAISE EXCEPTION 'Convention not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.profile_conventions pc
     WHERE pc.profile_id = v_owner_id
       AND pc.convention_id = NEW.convention_id
       AND pc.attendance_state = 'active'
       AND pc.active_until IS NULL
  ) THEN
    RAISE EXCEPTION 'Fursuit owner must join the convention before assigning this fursuit';
  END IF;

  IF NOT public.is_convention_prejoinable(NEW.convention_id) THEN
    IF v_convention_status = 'finalizing' THEN
      RAISE EXCEPTION 'Convention roster can no longer be changed';
    END IF;

    IF TG_OP = 'INSERT' THEN
      RETURN NULL;
    END IF;

    RAISE EXCEPTION 'Convention is not open for registration';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.convention_lifecycle_automation_job()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'app_private', 'public', 'extensions'
AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
  v_closeout_url text;
  v_headers jsonb;
  convention record;
BEGIN
  BEGIN
    PERFORM public.transition_ended_conventions_to_finalizing();
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'convention_lifecycle_automation_job: finalizing transition failed: %', SQLERRM;
  END;

  SELECT decrypted_secret
    INTO v_supabase_url
    FROM vault.decrypted_secrets
   WHERE name = 'SUPABASE_URL'
   ORDER BY created_at DESC
   LIMIT 1;

  SELECT decrypted_secret
    INTO v_service_role_key
    FROM vault.decrypted_secrets
   WHERE name IN ('closeout_service_role_key', 'SERVICE_ROLE_KEY', 'rotate_dailys_service_role_key')
   ORDER BY
     CASE name
       WHEN 'closeout_service_role_key' THEN 1
       WHEN 'SERVICE_ROLE_KEY' THEN 2
       ELSE 3
     END,
     created_at DESC
   LIMIT 1;

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    RAISE WARNING 'convention_lifecycle_automation_job: missing vault secret SUPABASE_URL';
    RETURN;
  END IF;

  IF v_service_role_key IS NULL OR v_service_role_key = '' THEN
    RAISE WARNING 'convention_lifecycle_automation_job: missing service role vault secret';
    RETURN;
  END IF;

  v_closeout_url := rtrim(v_supabase_url, '/') || '/functions/v1/close-out-convention';
  v_headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || v_service_role_key
  );

  FOR convention IN
    SELECT
      c.id,
      'cron_retry'::text AS source
    FROM public.conventions c
    WHERE c.status = 'closed'
      AND (c.closeout_error IS NOT NULL OR c.archived_at IS NULL)
      AND NOT EXISTS (
        SELECT 1
          FROM public.audit_log al
         WHERE al.entity_type = 'convention'
           AND al.entity_id = c.id
           AND al.action = 'close_convention_attempt'
           AND al.context->>'source' = 'cron_retry'
           AND al.created_at >= now() - interval '6 hours'
      )
      AND (
        SELECT count(*)
          FROM public.audit_log al
         WHERE al.entity_type = 'convention'
           AND al.entity_id = c.id
           AND al.action = 'close_convention_attempt'
           AND al.context->>'source' = 'cron_retry'
           AND al.created_at >= now() - interval '7 days'
      ) < 5
  LOOP
    BEGIN
      PERFORM net.http_post(
        url                  := v_closeout_url,
        headers              := v_headers,
        body                 := jsonb_build_object(
          'convention_id', convention.id::text,
          'source', convention.source
        ),
        timeout_milliseconds := 10000
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'convention lifecycle automation failed for convention %: %', convention.id, SQLERRM;
    END;
  END LOOP;
END;
$$;
