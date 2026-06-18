BEGIN;

ALTER TABLE public.notification_push_attempts
  ADD COLUMN IF NOT EXISTS expo_ticket_id text;

CREATE INDEX IF NOT EXISTS notification_push_attempts_expo_ticket_id_idx
  ON public.notification_push_attempts (expo_ticket_id)
  WHERE expo_ticket_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notification_push_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.notification_push_jobs(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL REFERENCES public.notification_push_attempts(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expo_ticket_id text NOT NULL,
  expo_push_token text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 1000,
  next_attempt_at timestamp with time zone DEFAULT now() + interval '15 minutes',
  expires_at timestamp with time zone NOT NULL DEFAULT now() + interval '24 hours',
  locked_at timestamp with time zone,
  locked_by text,
  last_polled_at timestamp with time zone,
  ok_at timestamp with time zone,
  error_at timestamp with time zone,
  expired_at timestamp with time zone,
  failed_at timestamp with time zone,
  expo_error text,
  expo_message text,
  last_error text,
  last_response_status integer,
  last_response_body jsonb,
  last_receipt_body jsonb,
  token_cleared boolean NOT NULL DEFAULT false,
  token_cleared_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_push_receipts_expo_ticket_id_key UNIQUE (expo_ticket_id),
  CONSTRAINT notification_push_receipts_status_check
    CHECK (status = ANY (ARRAY[
      'pending'::text,
      'processing'::text,
      'ok'::text,
      'error'::text,
      'retry_pending'::text,
      'expired'::text,
      'failed'::text
    ])),
  CONSTRAINT notification_push_receipts_attempt_count_check
    CHECK (attempt_count >= 0),
  CONSTRAINT notification_push_receipts_max_attempts_check
    CHECK (max_attempts > 0),
  CONSTRAINT notification_push_receipts_response_body_object_check
    CHECK (last_response_body IS NULL OR jsonb_typeof(last_response_body) = 'object'),
  CONSTRAINT notification_push_receipts_receipt_body_object_check
    CHECK (last_receipt_body IS NULL OR jsonb_typeof(last_receipt_body) = 'object')
);

CREATE INDEX IF NOT EXISTS notification_push_receipts_eligible_idx
  ON public.notification_push_receipts (status, next_attempt_at, expires_at, created_at)
  WHERE status IN ('pending', 'retry_pending');

CREATE INDEX IF NOT EXISTS notification_push_receipts_processing_idx
  ON public.notification_push_receipts (status, locked_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS notification_push_receipts_notification_created_idx
  ON public.notification_push_receipts (notification_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_push_receipts_user_created_idx
  ON public.notification_push_receipts (user_id, created_at DESC);

ALTER TABLE public.notification_push_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notification_push_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.notification_push_receipts TO service_role;

DROP POLICY IF EXISTS "notification_push_receipts_service_role_select"
  ON public.notification_push_receipts;
CREATE POLICY "notification_push_receipts_service_role_select"
  ON public.notification_push_receipts FOR SELECT TO public
  USING ((SELECT auth.role()) = 'service_role');

CREATE OR REPLACE FUNCTION public.set_notification_push_receipts_updated_at()
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

DROP TRIGGER IF EXISTS set_notification_push_receipts_updated_at
  ON public.notification_push_receipts;
CREATE TRIGGER set_notification_push_receipts_updated_at
  BEFORE UPDATE ON public.notification_push_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_notification_push_receipts_updated_at();

DROP FUNCTION IF EXISTS public.complete_notification_push_job(
  uuid,
  text,
  text,
  text,
  integer,
  jsonb,
  jsonb,
  text,
  integer
);

CREATE OR REPLACE FUNCTION public.complete_notification_push_job(
  p_job_id uuid,
  p_worker_id text,
  p_result_status text,
  p_error_message text DEFAULT NULL::text,
  p_response_status integer DEFAULT NULL::integer,
  p_response_body jsonb DEFAULT NULL::jsonb,
  p_request_snapshot jsonb DEFAULT NULL::jsonb,
  p_skip_reason text DEFAULT NULL::text,
  p_retry_after_seconds integer DEFAULT NULL::integer,
  p_expo_ticket_id text DEFAULT NULL::text,
  p_expo_push_token text DEFAULT NULL::text
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
  v_expo_ticket_id text := nullif(btrim(p_expo_ticket_id), '');
  v_expo_push_token text := nullif(btrim(p_expo_push_token), '');
  v_final_status text;
  v_retry_after_seconds integer := greatest(coalesce(p_retry_after_seconds, 60), 1);
  v_now timestamp with time zone := now();
  v_attempt_id uuid;
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

  IF v_result_status = 'sent'
    AND v_expo_ticket_id IS NOT NULL
    AND v_expo_push_token IS NULL
  THEN
    RAISE EXCEPTION 'Missing Expo push token for ticket receipt';
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
    request_snapshot,
    expo_ticket_id
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
    p_request_snapshot,
    v_expo_ticket_id
  )
  RETURNING id INTO v_attempt_id;

  IF v_final_status = 'sent' AND v_expo_ticket_id IS NOT NULL THEN
    INSERT INTO public.notification_push_receipts (
      job_id,
      attempt_id,
      notification_id,
      user_id,
      expo_ticket_id,
      expo_push_token,
      status,
      next_attempt_at,
      expires_at
    )
    VALUES (
      v_job.id,
      v_attempt_id,
      v_job.notification_id,
      v_job.user_id,
      v_expo_ticket_id,
      v_expo_push_token,
      'pending',
      v_now + interval '15 minutes',
      v_now + interval '24 hours'
    )
    ON CONFLICT (expo_ticket_id) DO NOTHING;
  END IF;

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
  integer,
  text,
  text
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
  integer,
  text,
  text
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_notification_push_receipts(
  p_worker_id text,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  id uuid,
  job_id uuid,
  attempt_id uuid,
  notification_id uuid,
  user_id uuid,
  expo_ticket_id text,
  expo_push_token text,
  attempt_number integer,
  max_attempts integer,
  expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_worker_id text := nullif(btrim(p_worker_id), '');
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 1000);
BEGIN
  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION 'Missing push receipt worker id';
  END IF;

  RETURN QUERY
  WITH eligible AS (
    SELECT r.id
      FROM public.notification_push_receipts r
     WHERE (
         (
           r.status IN ('pending', 'retry_pending')
           AND (
             r.expires_at <= now()
             OR (
               r.attempt_count < r.max_attempts
               AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= now())
             )
           )
         )
         OR (
           r.status = 'processing'
           AND r.locked_at < now() - interval '5 minutes'
           AND (r.expires_at <= now() OR r.attempt_count < r.max_attempts)
         )
       )
     ORDER BY r.expires_at, r.next_attempt_at NULLS FIRST, r.created_at
     LIMIT v_limit
     FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.notification_push_receipts r
       SET status = 'processing',
           locked_at = now(),
           locked_by = v_worker_id,
           attempt_count = r.attempt_count + 1,
           last_polled_at = now(),
           last_error = NULL,
           updated_at = now()
      FROM eligible e
     WHERE r.id = e.id
    RETURNING
      r.id,
      r.job_id,
      r.attempt_id,
      r.notification_id,
      r.user_id,
      r.expo_ticket_id,
      r.expo_push_token,
      r.attempt_count,
      r.max_attempts,
      r.expires_at
  )
  SELECT
    claimed.id,
    claimed.job_id,
    claimed.attempt_id,
    claimed.notification_id,
    claimed.user_id,
    claimed.expo_ticket_id,
    claimed.expo_push_token,
    claimed.attempt_count AS attempt_number,
    claimed.max_attempts,
    claimed.expires_at
  FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_push_receipts(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_push_receipts(text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_notification_push_receipt(
  p_receipt_id uuid,
  p_worker_id text,
  p_result_status text,
  p_error_message text DEFAULT NULL::text,
  p_response_status integer DEFAULT NULL::integer,
  p_response_body jsonb DEFAULT NULL::jsonb,
  p_receipt_body jsonb DEFAULT NULL::jsonb,
  p_expo_error text DEFAULT NULL::text,
  p_expo_message text DEFAULT NULL::text,
  p_retry_after_seconds integer DEFAULT NULL::integer,
  p_token_cleared boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_receipt record;
  v_worker_id text := nullif(btrim(p_worker_id), '');
  v_result_status text := nullif(btrim(p_result_status), '');
  v_final_status text;
  v_retry_after_seconds integer := greatest(coalesce(p_retry_after_seconds, 300), 1);
  v_now timestamp with time zone := now();
BEGIN
  IF p_receipt_id IS NULL THEN
    RAISE EXCEPTION 'Missing push receipt id';
  END IF;

  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION 'Missing push receipt worker id';
  END IF;

  IF v_result_status IS NULL
    OR v_result_status NOT IN ('ok', 'error', 'retry_pending', 'expired', 'failed')
  THEN
    RAISE EXCEPTION 'Invalid push receipt result status';
  END IF;

  SELECT *
    INTO v_receipt
    FROM public.notification_push_receipts
   WHERE id = p_receipt_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Push receipt not found';
  END IF;

  IF v_receipt.status <> 'processing' THEN
    RAISE EXCEPTION 'Push receipt is not processing';
  END IF;

  IF v_receipt.locked_by IS DISTINCT FROM v_worker_id THEN
    RAISE EXCEPTION 'Push receipt lock mismatch';
  END IF;

  v_final_status := v_result_status;
  IF v_result_status = 'retry_pending' AND v_receipt.expires_at <= v_now THEN
    v_final_status := 'expired';
  ELSIF v_result_status = 'retry_pending'
    AND v_receipt.attempt_count >= v_receipt.max_attempts
  THEN
    v_final_status := 'failed';
  END IF;

  UPDATE public.notification_push_receipts
     SET status = v_final_status,
         locked_at = NULL,
         locked_by = NULL,
         next_attempt_at = CASE
           WHEN v_final_status = 'retry_pending'
             THEN v_now + (v_retry_after_seconds * interval '1 second')
           ELSE NULL
         END,
         ok_at = CASE WHEN v_final_status = 'ok' THEN v_now ELSE ok_at END,
         error_at = CASE WHEN v_final_status = 'error' THEN v_now ELSE error_at END,
         expired_at = CASE WHEN v_final_status = 'expired' THEN v_now ELSE expired_at END,
         failed_at = CASE WHEN v_final_status = 'failed' THEN v_now ELSE failed_at END,
         expo_error = p_expo_error,
         expo_message = p_expo_message,
         last_error = p_error_message,
         last_response_status = p_response_status,
         last_response_body = p_response_body,
         last_receipt_body = p_receipt_body,
         token_cleared = token_cleared OR coalesce(p_token_cleared, false),
         token_cleared_at = CASE
           WHEN coalesce(p_token_cleared, false) THEN v_now
           ELSE token_cleared_at
         END,
         updated_at = v_now
   WHERE id = v_receipt.id;

  RETURN v_final_status;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_notification_push_receipt(
  uuid,
  text,
  text,
  text,
  integer,
  jsonb,
  jsonb,
  text,
  text,
  integer,
  boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_notification_push_receipt(
  uuid,
  text,
  text,
  text,
  integer,
  jsonb,
  jsonb,
  text,
  text,
  integer,
  boolean
) TO service_role;

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
      ('push_delivery'::text, 'Push delivery'::text),
      ('push_receipt_polling'::text, 'Push receipt polling'::text)
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
  v_command text := 'SELECT public.invoke_edge_function(''process-push-receipts'', jsonb_build_object(''maxReceipts'', 100, ''maxDurationMs'', 10000, ''source'', ''cron''));';
BEGIN
  SELECT j.jobid
    INTO v_job_id
    FROM cron.job j
   WHERE j.jobname = 'process-notification-push-receipts'
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      v_job_id,
      schedule := '*/5 * * * *',
      command := v_command
    );
  ELSE
    PERFORM cron.schedule(
      'process-notification-push-receipts',
      '*/5 * * * *',
      v_command
    );
  END IF;
END;
$$;

COMMENT ON TABLE public.notification_push_receipts IS
  'Expo push receipt polling records keyed one-to-one with Expo push ticket ids.';
COMMENT ON FUNCTION public.complete_notification_push_job(uuid, text, text, text, integer, jsonb, jsonb, text, integer, text, text) IS
  'Records the final push job delivery attempt result and enqueues an Expo receipt poll when Expo accepts a ticket.';
COMMENT ON FUNCTION public.claim_notification_push_receipts(text, integer) IS
  'Claims eligible Expo push receipts with row locking for service-role workers.';
COMMENT ON FUNCTION public.complete_notification_push_receipt(uuid, text, text, text, integer, jsonb, jsonb, text, text, integer, boolean) IS
  'Records the latest Expo receipt polling outcome and transitions the claimed receipt.';

COMMIT;
