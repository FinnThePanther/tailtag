CREATE OR REPLACE FUNCTION public.get_gameplay_queue_health()
RETURNS TABLE(
  queue_depth integer,
  visible_queue_depth integer,
  oldest_visible_message_enqueued_at timestamp with time zone,
  oldest_visible_message_age_seconds integer,
  oldest_unprocessed_event_received_at timestamp with time zone,
  oldest_unprocessed_event_age_seconds integer,
  retrying_event_count integer,
  dead_lettered_event_count integer,
  grouped_failures jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pgmq', 'pg_temp'
AS $$
  WITH queue_stats AS (
    SELECT
      count(*)::integer AS queue_depth,
      count(*) FILTER (WHERE q.vt <= now())::integer AS visible_queue_depth,
      min(q.enqueued_at) FILTER (WHERE q.vt <= now()) AS oldest_visible_message_enqueued_at
    FROM pgmq.q_gameplay_event_processing q
  ),
  event_stats AS (
    SELECT
      min(e.received_at) FILTER (
        WHERE e.processed_at IS NULL
          AND e.dead_lettered_at IS NULL
      ) AS oldest_unprocessed_event_received_at,
      count(*) FILTER (
        WHERE e.processed_at IS NULL
          AND e.dead_lettered_at IS NULL
          AND e.retry_count > 0
      )::integer AS retrying_event_count,
      count(*) FILTER (
        WHERE e.processed_at IS NULL
          AND e.dead_lettered_at IS NOT NULL
      )::integer AS dead_lettered_event_count
    FROM public.events e
  ),
  failure_groups AS (
    SELECT
      e.type,
      e.convention_id,
      c.name AS convention_name,
      count(*) FILTER (
        WHERE e.processed_at IS NULL
          AND e.dead_lettered_at IS NULL
          AND e.retry_count > 0
      )::integer AS retrying_count,
      count(*) FILTER (
        WHERE e.processed_at IS NULL
          AND e.dead_lettered_at IS NOT NULL
      )::integer AS dead_lettered_count,
      max(e.last_attempted_at) AS latest_attempted_at,
      max(e.dead_lettered_at) AS latest_dead_lettered_at
    FROM public.events e
    LEFT JOIN public.conventions c ON c.id = e.convention_id
    WHERE e.processed_at IS NULL
      AND (
        (e.dead_lettered_at IS NULL AND e.retry_count > 0)
        OR e.dead_lettered_at IS NOT NULL
      )
    GROUP BY e.type, e.convention_id, c.name
  )
  SELECT
    COALESCE(qs.queue_depth, 0) AS queue_depth,
    COALESCE(qs.visible_queue_depth, 0) AS visible_queue_depth,
    qs.oldest_visible_message_enqueued_at,
    CASE
      WHEN qs.oldest_visible_message_enqueued_at IS NULL THEN NULL
      ELSE floor(extract(epoch FROM (now() - qs.oldest_visible_message_enqueued_at)))::integer
    END AS oldest_visible_message_age_seconds,
    es.oldest_unprocessed_event_received_at,
    CASE
      WHEN es.oldest_unprocessed_event_received_at IS NULL THEN NULL
      ELSE floor(extract(epoch FROM (now() - es.oldest_unprocessed_event_received_at)))::integer
    END AS oldest_unprocessed_event_age_seconds,
    COALESCE(es.retrying_event_count, 0) AS retrying_event_count,
    COALESCE(es.dead_lettered_event_count, 0) AS dead_lettered_event_count,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'type', fg.type,
            'convention_id', fg.convention_id,
            'convention_name', fg.convention_name,
            'retrying_count', fg.retrying_count,
            'dead_lettered_count', fg.dead_lettered_count,
            'latest_attempted_at', fg.latest_attempted_at,
            'latest_dead_lettered_at', fg.latest_dead_lettered_at
          )
          ORDER BY (fg.retrying_count + fg.dead_lettered_count) DESC, fg.type ASC
        )
        FROM failure_groups fg
      ),
      '[]'::jsonb
    ) AS grouped_failures
  FROM queue_stats qs
  CROSS JOIN event_stats es
  WHERE (SELECT auth.role()) = 'service_role';
$$;

REVOKE ALL ON FUNCTION public.get_gameplay_queue_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_gameplay_queue_health() FROM anon;
REVOKE ALL ON FUNCTION public.get_gameplay_queue_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_gameplay_queue_health() TO service_role;

COMMENT ON FUNCTION public.get_gameplay_queue_health() IS
  'Returns service-role-only gameplay queue and event failure health for the admin backend health dashboard.';
