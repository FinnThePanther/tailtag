ALTER TABLE public.backend_worker_heartbeats
  ADD COLUMN IF NOT EXISTS idle_count_window_started_at timestamp with time zone NOT NULL DEFAULT now();

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
