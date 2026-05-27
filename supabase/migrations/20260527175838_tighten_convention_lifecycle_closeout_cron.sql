-- Run convention lifecycle automation close to the local 9:00 AM closeout deadline.
--
-- Closeout deadlines are stored as absolute timestamptz values calculated from
-- the convention timezone. Running every five minutes lets conventions close at
-- 9:00 AM local time, instead of waiting for the previous hourly cron slot.

COMMENT ON FUNCTION public.calculate_convention_closeout_not_before(date, text) IS
  'Calculates the closeout deadline as 9:00 AM local time three calendar days after end_date.';

CREATE OR REPLACE FUNCTION app_private.invoke_convention_closeout(
  p_closeout_url text,
  p_headers jsonb,
  p_convention_id uuid,
  p_source text,
  p_context text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'app_private', 'public', 'extensions'
AS $$
DECLARE
  v_http_request_id bigint;
  v_http_response record;
BEGIN
  v_http_request_id := net.http_post(
    url                  := p_closeout_url,
    headers              := p_headers,
    body                 := jsonb_build_object(
      'convention_id', p_convention_id::text,
      'source', p_source
    ),
    timeout_milliseconds := 120000
  );

  v_http_response := net.http_collect_response(v_http_request_id, false);

  IF v_http_response.status <> 'SUCCESS' THEN
    RAISE EXCEPTION '% HTTP request % failed: %',
      p_context,
      v_http_request_id,
      v_http_response.message;
  END IF;

  IF (v_http_response.response).status_code < 200
    OR (v_http_response.response).status_code >= 300
  THEN
    RAISE EXCEPTION '% HTTP request % returned status %: %',
      p_context,
      v_http_request_id,
      (v_http_response.response).status_code,
      (v_http_response.response).body;
  END IF;
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

  -- 3. Close out finalizing conventions that have reached their 9:00 AM local deadline.
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
      PERFORM app_private.invoke_convention_closeout(
        v_closeout_url,
        v_headers,
        convention.id,
        convention.source,
        'convention lifecycle closeout'
      );
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
      PERFORM app_private.invoke_convention_closeout(
        v_closeout_url,
        v_headers,
        convention.id,
        convention.source,
        'convention lifecycle retry'
      );
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
      PERFORM app_private.invoke_convention_closeout(
        v_closeout_url,
        v_headers,
        convention.id,
        convention.source,
        'legacy convention lifecycle retry'
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'legacy convention lifecycle retry failed for convention %: %', convention.id, SQLERRM;
        RAISE;
    END;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT j.jobid
    INTO v_job_id
    FROM cron.job j
   WHERE j.jobname = 'convention-lifecycle-automation'
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      v_job_id,
      schedule := '*/5 * * * *',
      command  := 'select app_private.convention_lifecycle_automation_job();'
    );
  ELSE
    PERFORM cron.schedule(
      'convention-lifecycle-automation',
      '*/5 * * * *',
      'select app_private.convention_lifecycle_automation_job();'
    );
  END IF;
END;
$$;
