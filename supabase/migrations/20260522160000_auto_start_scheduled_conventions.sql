-- Auto-start scheduled conventions when their local start date begins.
--
-- Scheduled conventions that pass readiness gates (rotation tasks, geofence,
-- date window) are transitioned to live automatically by the lifecycle cron
-- job. Operators can still start manually as a fallback.

CREATE OR REPLACE FUNCTION public.transition_started_conventions_to_live(
  p_now timestamp with time zone DEFAULT now()
)
RETURNS TABLE (
  convention_id uuid,
  started_at timestamp with time zone
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
      c.start_date,
      c.started_at,
      tz.effective_timezone,
      info.local_day,
      (SELECT count(*) >= 3
         FROM public.daily_tasks dt
        WHERE dt.is_active = TRUE
          AND (dt.convention_id IS NULL OR dt.convention_id = c.id)
      ) AS has_rotation_tasks
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
    WHERE c.status = 'scheduled'
      AND c.start_date IS NOT NULL
      AND c.start_date <= info.local_day
      AND (c.end_date IS NULL OR info.local_day <= c.end_date)
      AND (
        (c.geofence_enabled IS NOT TRUE AND c.location_verification_required IS NOT TRUE)
        OR (
          c.latitude IS NOT NULL
          AND c.longitude IS NOT NULL
          AND c.geofence_radius_meters IS NOT NULL
        )
      )
    FOR UPDATE OF c SKIP LOCKED
  ),
  filtered AS (
    SELECT candidates.*
    FROM candidates
    WHERE candidates.has_rotation_tasks
  ),
  transitioned AS (
    UPDATE public.conventions c
       SET status = 'live',
           started_at = COALESCE(
             c.started_at,
             filtered.start_date::timestamp AT TIME ZONE filtered.effective_timezone
           )
      FROM filtered
     WHERE c.id = filtered.id
     RETURNING c.id, c.started_at
  )
  SELECT transitioned.id, transitioned.started_at
  FROM transitioned
  ORDER BY transitioned.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_started_conventions_to_live(timestamp with time zone)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_started_conventions_to_live(timestamp with time zone)
  TO service_role;

COMMENT ON FUNCTION public.transition_started_conventions_to_live(timestamp with time zone) IS
  'Auto-starts scheduled conventions whose local start date has begun. Requires active rotation tasks, valid date window, and geofence completeness when enabled.';

-- Update the lifecycle automation job to call auto-start before finalizing.

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
  v_http_request_id bigint;
  v_http_response record;
  convention record;
BEGIN
  -- 1. Auto-start scheduled conventions whose window has begun.
  BEGIN
    PERFORM public.transition_started_conventions_to_live();
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'convention_lifecycle_automation_job: auto-start transition failed: %', SQLERRM;
  END;

  -- 2. Transition ended live conventions into finalizing.
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

  -- 3. Close out finalizing conventions that have reached deadline.
  FOR convention IN
    SELECT
      c.id,
      'cron_close'::text AS source
    FROM public.conventions c
    WHERE c.status = 'finalizing'
      AND c.closeout_not_before IS NOT NULL
      AND c.closeout_not_before <= now()
      AND NOT EXISTS (
        SELECT 1
          FROM public.audit_log al
         WHERE al.entity_type = 'convention'
           AND al.entity_id = c.id
           AND al.action = 'close_convention_attempt'
           AND al.context->>'source' = 'cron_close'
           AND al.created_at >= now() - interval '1 hour'
      )
  LOOP
    BEGIN
      v_http_request_id := net.http_post(
        url                  := v_closeout_url,
        headers              := v_headers,
        body                 := jsonb_build_object(
          'convention_id', convention.id::text,
          'source', convention.source
        ),
        timeout_milliseconds := 10000
      );

      v_http_response := net.http_collect_response(v_http_request_id, false);

      IF v_http_response.status <> 'SUCCESS' THEN
        RAISE EXCEPTION 'convention lifecycle closeout HTTP request % failed: %',
          v_http_request_id,
          v_http_response.message;
      END IF;

      IF (v_http_response.response).status_code < 200
        OR (v_http_response.response).status_code >= 300
      THEN
        RAISE EXCEPTION 'convention lifecycle closeout HTTP request % returned status %: %',
          v_http_request_id,
          (v_http_response.response).status_code,
          (v_http_response.response).body;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'convention lifecycle closeout failed for convention %: %', convention.id, SQLERRM;
        RAISE;
    END;
  END LOOP;

  -- 4. Retry failed closeouts.
  FOR convention IN
    SELECT
      c.id,
      'cron_retry'::text AS source
    FROM public.conventions c
    WHERE c.status = 'closeout_failed'
      AND c.closeout_retry_count < 5
      AND NOT EXISTS (
        SELECT 1
          FROM public.audit_log al
         WHERE al.entity_type = 'convention'
           AND al.entity_id = c.id
           AND al.action = 'close_convention_attempt'
           AND al.context->>'source' = 'cron_retry'
           AND al.created_at >= now() - interval '1 hour'
      )
  LOOP
    BEGIN
      v_http_request_id := net.http_post(
        url                  := v_closeout_url,
        headers              := v_headers,
        body                 := jsonb_build_object(
          'convention_id', convention.id::text,
          'source', convention.source
        ),
        timeout_milliseconds := 10000
      );

      v_http_response := net.http_collect_response(v_http_request_id, false);

      IF v_http_response.status <> 'SUCCESS' THEN
        RAISE EXCEPTION 'convention lifecycle retry HTTP request % failed: %',
          v_http_request_id,
          v_http_response.message;
      END IF;

      IF (v_http_response.response).status_code < 200
        OR (v_http_response.response).status_code >= 300
      THEN
        RAISE EXCEPTION 'convention lifecycle retry HTTP request % returned status %: %',
          v_http_request_id,
          (v_http_response.response).status_code,
          (v_http_response.response).body;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'convention lifecycle retry failed for convention %: %', convention.id, SQLERRM;
        RAISE;
    END;
  END LOOP;

  -- 5. Retry legacy closed conventions.
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
      v_http_request_id := net.http_post(
        url                  := v_closeout_url,
        headers              := v_headers,
        body                 := jsonb_build_object(
          'convention_id', convention.id::text,
          'source', convention.source
        ),
        timeout_milliseconds := 10000
      );

      v_http_response := net.http_collect_response(v_http_request_id, false);

      IF v_http_response.status <> 'SUCCESS' THEN
        RAISE EXCEPTION 'legacy convention lifecycle retry HTTP request % failed: %',
          v_http_request_id,
          v_http_response.message;
      END IF;

      IF (v_http_response.response).status_code < 200
        OR (v_http_response.response).status_code >= 300
      THEN
        RAISE EXCEPTION 'legacy convention lifecycle retry HTTP request % returned status %: %',
          v_http_request_id,
          (v_http_response.response).status_code,
          (v_http_response.response).body;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'legacy convention lifecycle retry failed for convention %: %', convention.id, SQLERRM;
        RAISE;
    END;
  END LOOP;
END;
$$;
