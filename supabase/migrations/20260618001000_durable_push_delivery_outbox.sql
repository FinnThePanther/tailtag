BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_push_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamp with time zone DEFAULT now(),
  locked_at timestamp with time zone,
  locked_by text,
  last_attempted_at timestamp with time zone,
  sent_at timestamp with time zone,
  skipped_at timestamp with time zone,
  failed_at timestamp with time zone,
  last_error text,
  last_response_status integer,
  last_response_body jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_push_jobs_notification_id_key UNIQUE (notification_id),
  CONSTRAINT notification_push_jobs_status_check
    CHECK (status = ANY (ARRAY[
      'pending'::text,
      'processing'::text,
      'sent'::text,
      'skipped'::text,
      'retry_pending'::text,
      'failed'::text
    ])),
  CONSTRAINT notification_push_jobs_attempt_count_check
    CHECK (attempt_count >= 0),
  CONSTRAINT notification_push_jobs_max_attempts_check
    CHECK (max_attempts > 0),
  CONSTRAINT notification_push_jobs_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT notification_push_jobs_response_body_object_check
    CHECK (last_response_body IS NULL OR jsonb_typeof(last_response_body) = 'object')
);

CREATE INDEX IF NOT EXISTS notification_push_jobs_eligible_idx
  ON public.notification_push_jobs (status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'retry_pending');

CREATE INDEX IF NOT EXISTS notification_push_jobs_processing_idx
  ON public.notification_push_jobs (status, locked_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS notification_push_jobs_user_created_idx
  ON public.notification_push_jobs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_push_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.notification_push_jobs(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  result_status text NOT NULL,
  error_message text,
  skip_reason text,
  expo_response_status integer,
  expo_response_body jsonb,
  request_snapshot jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_push_attempts_job_attempt_key UNIQUE (job_id, attempt_number),
  CONSTRAINT notification_push_attempts_attempt_number_check
    CHECK (attempt_number > 0),
  CONSTRAINT notification_push_attempts_result_status_check
    CHECK (result_status = ANY (ARRAY[
      'sent'::text,
      'skipped'::text,
      'retry_pending'::text,
      'failed'::text
    ])),
  CONSTRAINT notification_push_attempts_response_body_object_check
    CHECK (expo_response_body IS NULL OR jsonb_typeof(expo_response_body) = 'object'),
  CONSTRAINT notification_push_attempts_request_snapshot_object_check
    CHECK (request_snapshot IS NULL OR jsonb_typeof(request_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS notification_push_attempts_notification_created_idx
  ON public.notification_push_attempts (notification_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_push_attempts_job_created_idx
  ON public.notification_push_attempts (job_id, created_at DESC);

ALTER TABLE public.notification_push_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_push_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notification_push_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.notification_push_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_push_jobs TO service_role;
REVOKE UPDATE, DELETE ON TABLE public.notification_push_attempts FROM service_role;
GRANT SELECT, INSERT ON TABLE public.notification_push_attempts TO service_role;

DROP POLICY IF EXISTS "notification_push_jobs_service_role_select"
  ON public.notification_push_jobs;
CREATE POLICY "notification_push_jobs_service_role_select"
  ON public.notification_push_jobs FOR SELECT TO public
  USING ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "notification_push_jobs_service_role_insert"
  ON public.notification_push_jobs;
CREATE POLICY "notification_push_jobs_service_role_insert"
  ON public.notification_push_jobs FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "notification_push_jobs_service_role_update"
  ON public.notification_push_jobs;
CREATE POLICY "notification_push_jobs_service_role_update"
  ON public.notification_push_jobs FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "notification_push_jobs_service_role_delete"
  ON public.notification_push_jobs;
CREATE POLICY "notification_push_jobs_service_role_delete"
  ON public.notification_push_jobs FOR DELETE TO public
  USING ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "notification_push_attempts_service_role_select"
  ON public.notification_push_attempts;
CREATE POLICY "notification_push_attempts_service_role_select"
  ON public.notification_push_attempts FOR SELECT TO public
  USING ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "notification_push_attempts_service_role_insert"
  ON public.notification_push_attempts;
CREATE POLICY "notification_push_attempts_service_role_insert"
  ON public.notification_push_attempts FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'service_role');

CREATE OR REPLACE FUNCTION public.set_notification_push_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_notification_push_jobs_updated_at
  ON public.notification_push_jobs;
CREATE TRIGGER set_notification_push_jobs_updated_at
  BEFORE UPDATE ON public.notification_push_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_notification_push_jobs_updated_at();

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

CREATE OR REPLACE FUNCTION public.claim_notification_push_jobs(
  p_worker_id text,
  p_limit integer DEFAULT 25,
  p_notification_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid,
  notification_id uuid,
  user_id uuid,
  notification_type text,
  payload jsonb,
  attempt_number integer,
  max_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_worker_id text := nullif(btrim(p_worker_id), '');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
BEGIN
  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION 'Missing push worker id';
  END IF;

  RETURN QUERY
  WITH eligible AS (
    SELECT j.id
      FROM public.notification_push_jobs j
     WHERE (p_notification_id IS NULL OR j.notification_id = p_notification_id)
       AND (
         (
           j.status IN ('pending', 'retry_pending')
           AND j.attempt_count < j.max_attempts
           AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= now())
         )
         OR (
           j.status = 'processing'
           AND j.attempt_count < j.max_attempts
           AND j.locked_at < now() - interval '5 minutes'
         )
       )
     ORDER BY j.next_attempt_at NULLS FIRST, j.created_at
     LIMIT v_limit
     FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.notification_push_jobs j
       SET status = 'processing',
           locked_at = now(),
           locked_by = v_worker_id,
           attempt_count = j.attempt_count + 1,
           last_attempted_at = now(),
           last_error = NULL,
           updated_at = now()
      FROM eligible e
     WHERE j.id = e.id
    RETURNING
      j.id,
      j.notification_id,
      j.user_id,
      j.notification_type,
      j.payload,
      j.attempt_count,
      j.max_attempts
  )
  SELECT
    claimed.id,
    claimed.notification_id,
    claimed.user_id,
    claimed.notification_type,
    claimed.payload,
    claimed.attempt_count AS attempt_number,
    claimed.max_attempts
  FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_push_jobs(text, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_push_jobs(text, integer, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_notification_push_job(
  p_job_id uuid,
  p_worker_id text,
  p_result_status text,
  p_error_message text DEFAULT NULL::text,
  p_response_status integer DEFAULT NULL::integer,
  p_response_body jsonb DEFAULT NULL::jsonb,
  p_request_snapshot jsonb DEFAULT NULL::jsonb,
  p_skip_reason text DEFAULT NULL::text,
  p_retry_after_seconds integer DEFAULT NULL::integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_job record;
  v_worker_id text := nullif(btrim(p_worker_id), '');
  v_result_status text := nullif(btrim(p_result_status), '');
  v_final_status text;
  v_retry_after_seconds integer := greatest(coalesce(p_retry_after_seconds, 60), 1);
  v_now timestamp with time zone := now();
BEGIN
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'Missing push job id';
  END IF;

  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION 'Missing push worker id';
  END IF;

  IF v_result_status IS NULL
    OR v_result_status NOT IN ('sent', 'skipped', 'retry_pending', 'failed')
  THEN
    RAISE EXCEPTION 'Invalid push job result status';
  END IF;

  SELECT *
    INTO v_job
    FROM public.notification_push_jobs
   WHERE id = p_job_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Push job not found';
  END IF;

  IF v_job.status <> 'processing' THEN
    RAISE EXCEPTION 'Push job is not processing';
  END IF;

  IF v_job.locked_by IS DISTINCT FROM v_worker_id THEN
    RAISE EXCEPTION 'Push job lock mismatch';
  END IF;

  v_final_status := v_result_status;
  IF v_result_status = 'retry_pending'
    AND v_job.attempt_count >= v_job.max_attempts
  THEN
    v_final_status := 'failed';
  END IF;

  INSERT INTO public.notification_push_attempts (
    job_id,
    notification_id,
    attempt_number,
    started_at,
    completed_at,
    result_status,
    error_message,
    skip_reason,
    expo_response_status,
    expo_response_body,
    request_snapshot
  )
  VALUES (
    v_job.id,
    v_job.notification_id,
    v_job.attempt_count,
    coalesce(v_job.last_attempted_at, v_now),
    v_now,
    v_final_status,
    p_error_message,
    p_skip_reason,
    p_response_status,
    p_response_body,
    p_request_snapshot
  );

  UPDATE public.notification_push_jobs
     SET status = v_final_status,
         locked_at = NULL,
         locked_by = NULL,
         next_attempt_at = CASE
           WHEN v_final_status = 'retry_pending'
             THEN v_now + (v_retry_after_seconds * interval '1 second')
           ELSE NULL
         END,
         sent_at = CASE WHEN v_final_status = 'sent' THEN v_now ELSE sent_at END,
         skipped_at = CASE WHEN v_final_status = 'skipped' THEN v_now ELSE skipped_at END,
         failed_at = CASE WHEN v_final_status = 'failed' THEN v_now ELSE failed_at END,
         last_error = coalesce(p_error_message, p_skip_reason),
         last_response_status = p_response_status,
         last_response_body = p_response_body,
         updated_at = v_now
   WHERE id = v_job.id;

  RETURN v_final_status;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_notification_push_job(
  uuid,
  text,
  text,
  text,
  integer,
  jsonb,
  jsonb,
  text,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_notification_push_job(
  uuid,
  text,
  text,
  text,
  integer,
  jsonb,
  jsonb,
  text,
  integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_edge_function(
  p_function_name text,
  p_body jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'pg_temp'
AS $$
DECLARE
  v_function_name text := nullif(btrim(p_function_name), '');
  v_url text;
  v_key text;
BEGIN
  IF v_function_name IS NULL THEN
    RAISE EXCEPTION 'Missing Edge Function name';
  END IF;

  SELECT decrypted_secret
    INTO v_url
    FROM vault.decrypted_secrets
   WHERE name = 'SUPABASE_URL'
   LIMIT 1;

  SELECT decrypted_secret
    INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'SERVICE_ROLE_KEY'
   LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'invoke_edge_function: missing vault secrets SUPABASE_URL or SERVICE_ROLE_KEY for %',
      v_function_name;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || v_function_name,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := coalesce(p_body, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_edge_function(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_edge_function(text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_send_push_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.enqueue_notification_push_job(NEW.id);

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

DROP TRIGGER IF EXISTS "send-push-on-notification-insert"
  ON public.notifications;
CREATE TRIGGER "send-push-on-notification-insert"
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.invoke_send_push_trigger();

WITH legacy_retry_candidates AS (
  SELECT DISTINCT ON (q.notification_id)
    q.id,
    q.notification_id,
    q.user_id,
    coalesce(q.notification_type, n.type) AS notification_type,
    coalesce(q.payload, n.payload, '{}'::jsonb) AS payload,
    greatest(coalesce(q.attempts, 0), 0) AS attempts,
    q.last_error,
    q.response_status,
    q.response_body,
    q.created_at
  FROM public.push_notification_retry_queue q
  JOIN public.notifications n ON n.id = q.notification_id
  WHERE q.processed_at IS NULL
  ORDER BY q.notification_id, q.attempts DESC, q.created_at DESC
),
migrated_jobs AS (
  INSERT INTO public.notification_push_jobs (
    notification_id,
    user_id,
    notification_type,
    payload,
    status,
    attempt_count,
    max_attempts,
    next_attempt_at,
    last_error,
    last_response_status,
    last_response_body,
    created_at,
    updated_at
  )
  SELECT
    c.notification_id,
    c.user_id,
    c.notification_type,
    c.payload,
    'retry_pending',
    c.attempts,
    greatest(5, c.attempts + 1),
    now(),
    c.last_error,
    c.response_status,
    c.response_body,
    c.created_at,
    now()
  FROM legacy_retry_candidates c
  ON CONFLICT (notification_id) DO NOTHING
  RETURNING notification_id
)
UPDATE public.push_notification_retry_queue q
   SET processed_at = now()
 WHERE q.processed_at IS NULL
   AND EXISTS (
     SELECT 1
       FROM legacy_retry_candidates c
      WHERE c.notification_id = q.notification_id
   );

UPDATE public.backend_worker_runs
   SET worker_name = 'push_delivery',
       updated_at = now()
 WHERE worker_name = 'push_retry_processing';

CREATE OR REPLACE FUNCTION public.get_backend_worker_run_health()
RETURNS TABLE(
  worker_name text,
  display_name text,
  latest_run_id uuid,
  latest_status text,
  latest_source text,
  latest_started_at timestamp with time zone,
  latest_completed_at timestamp with time zone,
  latest_duration_ms integer,
  latest_counts jsonb,
  latest_error_message text,
  last_success_at timestamp with time zone,
  last_failure_at timestamp with time zone,
  running_started_at timestamp with time zone,
  recent_failure_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH known_workers(worker_name, display_name) AS (
    -- Keep this list in sync with BackendWorkerName in
    -- supabase/functions/_shared/backendWorkerRuns.ts whenever a new durable
    -- backend worker run source is introduced.
    VALUES
      ('daily_task_rotation'::text, 'Daily task rotation'::text),
      ('pending_catch_expiration'::text, 'Pending catch expiration'::text),
      ('gameplay_queue_drain'::text, 'Gameplay queue drain'::text),
      ('push_delivery'::text, 'Push delivery'::text)
  ),
  latest_run AS (
    SELECT DISTINCT ON (r.worker_name)
      r.worker_name,
      r.id,
      r.status,
      r.source,
      r.started_at,
      r.completed_at,
      r.duration_ms,
      r.counts,
      r.error_message
    FROM public.backend_worker_runs r
    ORDER BY r.worker_name, r.started_at DESC
  ),
  latest_success AS (
    SELECT
      r.worker_name,
      max(r.completed_at) AS completed_at
    FROM public.backend_worker_runs r
    WHERE r.status = 'succeeded'
    GROUP BY r.worker_name
  ),
  latest_failure AS (
    SELECT
      r.worker_name,
      max(r.completed_at) AS completed_at
    FROM public.backend_worker_runs r
    WHERE r.status IN ('failed', 'partial')
    GROUP BY r.worker_name
  ),
  running AS (
    SELECT
      r.worker_name,
      min(r.started_at) AS started_at
    FROM public.backend_worker_runs r
    WHERE r.status = 'running'
    GROUP BY r.worker_name
  ),
  recent_failures AS (
    SELECT
      r.worker_name,
      count(*)::integer AS failure_count
    FROM public.backend_worker_runs r
    WHERE r.status IN ('failed', 'partial')
      AND r.started_at >= now() - interval '24 hours'
    GROUP BY r.worker_name
  )
  SELECT
    kw.worker_name,
    kw.display_name,
    lr.id AS latest_run_id,
    lr.status AS latest_status,
    lr.source AS latest_source,
    lr.started_at AS latest_started_at,
    lr.completed_at AS latest_completed_at,
    lr.duration_ms AS latest_duration_ms,
    COALESCE(lr.counts, '{}'::jsonb) AS latest_counts,
    lr.error_message AS latest_error_message,
    ls.completed_at AS last_success_at,
    lf.completed_at AS last_failure_at,
    running.started_at AS running_started_at,
    COALESCE(rf.failure_count, 0) AS recent_failure_count
  FROM known_workers kw
  LEFT JOIN latest_run lr USING (worker_name)
  LEFT JOIN latest_success ls USING (worker_name)
  LEFT JOIN latest_failure lf USING (worker_name)
  LEFT JOIN running USING (worker_name)
  LEFT JOIN recent_failures rf USING (worker_name)
  WHERE (SELECT auth.role()) = 'service_role'
  ORDER BY kw.display_name;
$$;

REVOKE ALL ON FUNCTION public.get_backend_worker_run_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_backend_worker_run_health() FROM anon;
REVOKE ALL ON FUNCTION public.get_backend_worker_run_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_backend_worker_run_health() TO service_role;

DO $$
DECLARE
  v_job_id bigint;
  v_command text := 'SELECT public.invoke_edge_function(''send-push'', jsonb_build_object(''maxJobs'', 25, ''maxDurationMs'', 10000, ''source'', ''cron''));';
BEGIN
  SELECT j.jobid
    INTO v_job_id
    FROM cron.job j
   WHERE j.jobname = 'process-notification-push-jobs'
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      v_job_id,
      schedule := '* * * * *',
      command := v_command
    );
  ELSE
    PERFORM cron.schedule(
      'process-notification-push-jobs',
      '* * * * *',
      v_command
    );
  END IF;
END;
$$;

COMMENT ON TABLE public.notification_push_jobs IS
  'Durable outbox jobs for Expo push delivery, keyed one-to-one with notifications.';
COMMENT ON TABLE public.notification_push_attempts IS
  'Per-attempt audit records for durable notification push delivery.';
COMMENT ON FUNCTION public.enqueue_notification_push_job(uuid) IS
  'Idempotently creates one push delivery job for a notification.';
COMMENT ON FUNCTION public.claim_notification_push_jobs(text, integer, uuid) IS
  'Claims eligible push delivery jobs with row locking for service-role workers.';
COMMENT ON FUNCTION public.complete_notification_push_job(uuid, text, text, text, integer, jsonb, jsonb, text, integer) IS
  'Records one push delivery attempt and transitions the claimed job.';

COMMIT;
