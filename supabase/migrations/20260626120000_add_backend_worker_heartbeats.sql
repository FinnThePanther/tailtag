CREATE TABLE IF NOT EXISTS public.backend_worker_heartbeats (
  worker_name text PRIMARY KEY,
  display_name text NOT NULL,
  source text NOT NULL,
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  last_idle_at timestamp with time zone,
  last_idle_duration_ms integer,
  last_idle_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  idle_count_window_started_at timestamp with time zone NOT NULL DEFAULT now(),
  idle_count_24h integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT backend_worker_heartbeats_last_idle_duration_check
    CHECK (last_idle_duration_ms IS NULL OR last_idle_duration_ms >= 0),
  CONSTRAINT backend_worker_heartbeats_idle_count_24h_check
    CHECK (idle_count_24h >= 0),
  CONSTRAINT backend_worker_heartbeats_last_idle_counts_object_check
    CHECK (jsonb_typeof(last_idle_counts) = 'object'),
  CONSTRAINT backend_worker_heartbeats_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

ALTER TABLE public.backend_worker_heartbeats ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.backend_worker_heartbeats FROM PUBLIC;
REVOKE ALL ON TABLE public.backend_worker_heartbeats FROM anon;
REVOKE ALL ON TABLE public.backend_worker_heartbeats FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.backend_worker_heartbeats TO service_role;

DROP POLICY IF EXISTS "backend_worker_heartbeats_service_role_select"
  ON public.backend_worker_heartbeats;
CREATE POLICY "backend_worker_heartbeats_service_role_select"
  ON public.backend_worker_heartbeats FOR SELECT TO public
  USING ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "backend_worker_heartbeats_service_role_insert"
  ON public.backend_worker_heartbeats;
CREATE POLICY "backend_worker_heartbeats_service_role_insert"
  ON public.backend_worker_heartbeats FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "backend_worker_heartbeats_service_role_update"
  ON public.backend_worker_heartbeats;
CREATE POLICY "backend_worker_heartbeats_service_role_update"
  ON public.backend_worker_heartbeats FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "backend_worker_heartbeats_service_role_delete"
  ON public.backend_worker_heartbeats;
CREATE POLICY "backend_worker_heartbeats_service_role_delete"
  ON public.backend_worker_heartbeats FOR DELETE TO public
  USING ((SELECT auth.role()) = 'service_role');

CREATE OR REPLACE FUNCTION public.set_backend_worker_heartbeats_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_backend_worker_heartbeats_updated_at
  ON public.backend_worker_heartbeats;
CREATE TRIGGER set_backend_worker_heartbeats_updated_at
  BEFORE UPDATE ON public.backend_worker_heartbeats
  FOR EACH ROW
  EXECUTE FUNCTION public.set_backend_worker_heartbeats_updated_at();

CREATE OR REPLACE FUNCTION public.record_backend_worker_heartbeat(
  p_worker_name text,
  p_display_name text,
  p_source text,
  p_last_idle_at timestamp with time zone,
  p_last_idle_duration_ms integer,
  p_last_idle_counts jsonb DEFAULT '{}'::jsonb,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.backend_worker_heartbeats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_now timestamp with time zone := now();
  v_row public.backend_worker_heartbeats;
BEGIN
  IF (SELECT auth.role()) <> 'service_role' THEN
    RAISE EXCEPTION 'record_backend_worker_heartbeat requires service_role';
  END IF;

  INSERT INTO public.backend_worker_heartbeats (
    worker_name,
    display_name,
    source,
    last_seen_at,
    last_idle_at,
    last_idle_duration_ms,
    last_idle_counts,
    idle_count_window_started_at,
    idle_count_24h,
    metadata
  )
  VALUES (
    p_worker_name,
    p_display_name,
    p_source,
    v_now,
    p_last_idle_at,
    p_last_idle_duration_ms,
    COALESCE(p_last_idle_counts, '{}'::jsonb),
    v_now,
    1,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (worker_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    source = EXCLUDED.source,
    last_seen_at = EXCLUDED.last_seen_at,
    last_idle_at = EXCLUDED.last_idle_at,
    last_idle_duration_ms = EXCLUDED.last_idle_duration_ms,
    last_idle_counts = EXCLUDED.last_idle_counts,
    idle_count_window_started_at = CASE
      WHEN public.backend_worker_heartbeats.idle_count_window_started_at < v_now - interval '24 hours' THEN v_now
      ELSE public.backend_worker_heartbeats.idle_count_window_started_at
    END,
    idle_count_24h = CASE
      WHEN public.backend_worker_heartbeats.idle_count_window_started_at < v_now - interval '24 hours' THEN 1
      ELSE public.backend_worker_heartbeats.idle_count_24h + 1
    END,
    metadata = EXCLUDED.metadata
  RETURNING *
    INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_backend_worker_heartbeat(
  text,
  text,
  text,
  timestamp with time zone,
  integer,
  jsonb,
  jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_backend_worker_heartbeat(
  text,
  text,
  text,
  timestamp with time zone,
  integer,
  jsonb,
  jsonb
) TO service_role;

DROP FUNCTION IF EXISTS public.get_backend_worker_run_health();

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
  recent_failure_count integer,
  last_heartbeat_at timestamp with time zone,
  last_idle_at timestamp with time zone,
  last_idle_counts jsonb,
  idle_count_24h integer
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
    COALESCE(rf.failure_count, 0) AS recent_failure_count,
    hb.last_seen_at AS last_heartbeat_at,
    hb.last_idle_at,
    COALESCE(hb.last_idle_counts, '{}'::jsonb) AS last_idle_counts,
    COALESCE(hb.idle_count_24h, 0) AS idle_count_24h
  FROM known_workers kw
  LEFT JOIN latest_run lr USING (worker_name)
  LEFT JOIN latest_success ls USING (worker_name)
  LEFT JOIN latest_failure lf USING (worker_name)
  LEFT JOIN running USING (worker_name)
  LEFT JOIN recent_failures rf USING (worker_name)
  LEFT JOIN public.backend_worker_heartbeats hb USING (worker_name)
  WHERE (SELECT auth.role()) = 'service_role'
  ORDER BY kw.display_name;
$$;

REVOKE ALL ON FUNCTION public.get_backend_worker_run_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_backend_worker_run_health() FROM anon;
REVOKE ALL ON FUNCTION public.get_backend_worker_run_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_backend_worker_run_health() TO service_role;

COMMENT ON TABLE public.backend_worker_heartbeats IS
  'Compacted freshness records for successful idle backend worker cron runs.';
COMMENT ON FUNCTION public.record_backend_worker_heartbeat(text, text, text, timestamp with time zone, integer, jsonb, jsonb) IS
  'Records a compact service-role heartbeat for a successful idle backend worker cron run.';
COMMENT ON FUNCTION public.get_backend_worker_run_health() IS
  'Returns backend worker durable run health plus compact idle heartbeat freshness for admin diagnostics.';
