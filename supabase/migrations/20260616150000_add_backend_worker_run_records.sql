BEGIN;

CREATE TABLE IF NOT EXISTS public.backend_worker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name text NOT NULL,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  duration_ms integer,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  error_details jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT backend_worker_runs_status_check
    CHECK (status = ANY (ARRAY['running'::text, 'succeeded'::text, 'partial'::text, 'failed'::text])),
  CONSTRAINT backend_worker_runs_counts_object_check
    CHECK (jsonb_typeof(counts) = 'object'),
  CONSTRAINT backend_worker_runs_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT backend_worker_runs_error_details_object_check
    CHECK (error_details IS NULL OR jsonb_typeof(error_details) = 'object'),
  CONSTRAINT backend_worker_runs_completion_check
    CHECK (
      (status = 'running' AND completed_at IS NULL)
      OR (status <> 'running' AND completed_at IS NOT NULL)
    ),
  CONSTRAINT backend_worker_runs_duration_check
    CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

CREATE INDEX IF NOT EXISTS backend_worker_runs_worker_started_idx
  ON public.backend_worker_runs (worker_name, started_at DESC);

CREATE INDEX IF NOT EXISTS backend_worker_runs_worker_status_started_idx
  ON public.backend_worker_runs (worker_name, status, started_at DESC);

CREATE INDEX IF NOT EXISTS backend_worker_runs_running_idx
  ON public.backend_worker_runs (worker_name, started_at DESC)
  WHERE status = 'running';

ALTER TABLE public.backend_worker_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.backend_worker_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.backend_worker_runs FROM anon;
REVOKE ALL ON TABLE public.backend_worker_runs FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.backend_worker_runs TO service_role;

DROP POLICY IF EXISTS "backend_worker_runs_service_role_select"
  ON public.backend_worker_runs;
CREATE POLICY "backend_worker_runs_service_role_select"
  ON public.backend_worker_runs FOR SELECT TO public
  USING ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "backend_worker_runs_service_role_insert"
  ON public.backend_worker_runs;
CREATE POLICY "backend_worker_runs_service_role_insert"
  ON public.backend_worker_runs FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "backend_worker_runs_service_role_update"
  ON public.backend_worker_runs;
CREATE POLICY "backend_worker_runs_service_role_update"
  ON public.backend_worker_runs FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "backend_worker_runs_service_role_delete"
  ON public.backend_worker_runs;
CREATE POLICY "backend_worker_runs_service_role_delete"
  ON public.backend_worker_runs FOR DELETE TO public
  USING ((SELECT auth.role()) = 'service_role');

CREATE OR REPLACE FUNCTION public.set_backend_worker_runs_updated_at()
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

DROP TRIGGER IF EXISTS set_backend_worker_runs_updated_at
  ON public.backend_worker_runs;
CREATE TRIGGER set_backend_worker_runs_updated_at
  BEFORE UPDATE ON public.backend_worker_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_backend_worker_runs_updated_at();

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
      ('push_retry_processing'::text, 'Push retry processing'::text)
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

COMMENT ON TABLE public.backend_worker_runs IS
  'Durable run history for scheduled and asynchronous backend workers.';
COMMENT ON FUNCTION public.get_backend_worker_run_health() IS
  'Returns latest run, latest success/failure, and recent failure count for operator backend worker health views.';

COMMIT;
