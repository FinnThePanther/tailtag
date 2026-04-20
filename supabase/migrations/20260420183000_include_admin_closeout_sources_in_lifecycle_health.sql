CREATE OR REPLACE FUNCTION public.get_convention_lifecycle_health_counts(
  p_convention_ids uuid[],
  p_local_days jsonb DEFAULT '{}'::jsonb,
  p_retry_window_start timestamp with time zone DEFAULT now() - interval '7 days',
  p_throttle_window_start timestamp with time zone DEFAULT now() - interval '6 hours'
)
RETURNS TABLE (
  convention_id uuid,
  convention_tasks_count integer,
  today_assignments_count integer,
  accepted_convention_catches_count integer,
  pending_convention_catches_count integer,
  active_profile_memberships_count integer,
  active_fursuit_assignments_count integer,
  participant_recaps_count integer,
  last_automation_attempt_at timestamp with time zone,
  last_automation_source text,
  automation_retry_attempts_last_7_days integer,
  recent_cron_close_attempt boolean,
  recent_cron_retry_attempt boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requested AS (
    SELECT DISTINCT unnest(COALESCE(p_convention_ids, ARRAY[]::uuid[])) AS convention_id
  ),
  convention_tasks AS (
    SELECT dt.convention_id, COUNT(*)::integer AS row_count
    FROM public.daily_tasks dt
    JOIN requested r ON r.convention_id = dt.convention_id
    WHERE dt.is_active = true
    GROUP BY dt.convention_id
  ),
  today_assignments AS (
    SELECT da.convention_id, COUNT(*)::integer AS row_count
    FROM public.daily_assignments da
    JOIN requested r ON r.convention_id = da.convention_id
    WHERE da.day = NULLIF(p_local_days ->> da.convention_id::text, '')::date
    GROUP BY da.convention_id
  ),
  accepted_catches AS (
    SELECT c.convention_id, COUNT(*)::integer AS row_count
    FROM public.catches c
    JOIN requested r ON r.convention_id = c.convention_id
    WHERE c.status = 'ACCEPTED'
      AND c.is_tutorial = false
    GROUP BY c.convention_id
  ),
  pending_catches AS (
    SELECT c.convention_id, COUNT(*)::integer AS row_count
    FROM public.catches c
    JOIN requested r ON r.convention_id = c.convention_id
    WHERE c.status = 'PENDING'
    GROUP BY c.convention_id
  ),
  profile_memberships AS (
    SELECT pc.convention_id, COUNT(*)::integer AS row_count
    FROM public.profile_conventions pc
    JOIN requested r ON r.convention_id = pc.convention_id
    GROUP BY pc.convention_id
  ),
  fursuit_assignments AS (
    SELECT fc.convention_id, COUNT(*)::integer AS row_count
    FROM public.fursuit_conventions fc
    JOIN requested r ON r.convention_id = fc.convention_id
    GROUP BY fc.convention_id
  ),
  participant_recaps AS (
    SELECT cpr.convention_id, COUNT(*)::integer AS row_count
    FROM public.convention_participant_recaps cpr
    JOIN requested r ON r.convention_id = cpr.convention_id
    GROUP BY cpr.convention_id
  ),
  last_automation AS (
    SELECT DISTINCT ON (al.entity_id)
      al.entity_id AS convention_id,
      al.created_at,
      al.context ->> 'source' AS source
    FROM public.audit_log al
    JOIN requested r ON r.convention_id = al.entity_id
    WHERE al.entity_type = 'convention'
      AND al.action IN (
        'close_convention_attempt',
        'close_convention_noop',
        'regenerate_convention_recaps_attempt'
      )
      AND al.context ->> 'source' IN (
        'cron_close',
        'cron_retry',
        'admin_close',
        'admin_retry',
        'admin_regenerate'
      )
    ORDER BY al.entity_id, al.created_at DESC
  ),
  automation_counts AS (
    SELECT
      al.entity_id AS convention_id,
      COUNT(*) FILTER (
        WHERE al.action = 'close_convention_attempt'
          AND al.context ->> 'source' = 'cron_retry'
          AND al.created_at >= p_retry_window_start
      )::integer AS retry_attempts_last_7_days,
      COALESCE(
        BOOL_OR(al.created_at >= p_throttle_window_start) FILTER (
          WHERE al.action = 'close_convention_attempt'
            AND al.context ->> 'source' = 'cron_close'
        ),
        false
      ) AS recent_cron_close_attempt,
      COALESCE(
        BOOL_OR(al.created_at >= p_throttle_window_start) FILTER (
          WHERE al.action = 'close_convention_attempt'
            AND al.context ->> 'source' = 'cron_retry'
        ),
        false
      ) AS recent_cron_retry_attempt
    FROM public.audit_log al
    JOIN requested r ON r.convention_id = al.entity_id
    WHERE al.entity_type = 'convention'
      AND al.action IN ('close_convention_attempt', 'close_convention_noop')
      AND al.context ->> 'source' IN ('cron_close', 'cron_retry')
    GROUP BY al.entity_id
  )
  SELECT
    r.convention_id,
    COALESCE(ct.row_count, 0) AS convention_tasks_count,
    COALESCE(ta.row_count, 0) AS today_assignments_count,
    COALESCE(ac.row_count, 0) AS accepted_convention_catches_count,
    COALESCE(pc.row_count, 0) AS pending_convention_catches_count,
    COALESCE(pm.row_count, 0) AS active_profile_memberships_count,
    COALESCE(fa.row_count, 0) AS active_fursuit_assignments_count,
    COALESCE(pr.row_count, 0) AS participant_recaps_count,
    la.created_at AS last_automation_attempt_at,
    la.source AS last_automation_source,
    COALESCE(auc.retry_attempts_last_7_days, 0) AS automation_retry_attempts_last_7_days,
    COALESCE(auc.recent_cron_close_attempt, false) AS recent_cron_close_attempt,
    COALESCE(auc.recent_cron_retry_attempt, false) AS recent_cron_retry_attempt
  FROM requested r
  LEFT JOIN convention_tasks ct ON ct.convention_id = r.convention_id
  LEFT JOIN today_assignments ta ON ta.convention_id = r.convention_id
  LEFT JOIN accepted_catches ac ON ac.convention_id = r.convention_id
  LEFT JOIN pending_catches pc ON pc.convention_id = r.convention_id
  LEFT JOIN profile_memberships pm ON pm.convention_id = r.convention_id
  LEFT JOIN fursuit_assignments fa ON fa.convention_id = r.convention_id
  LEFT JOIN participant_recaps pr ON pr.convention_id = r.convention_id
  LEFT JOIN last_automation la ON la.convention_id = r.convention_id
  LEFT JOIN automation_counts auc ON auc.convention_id = r.convention_id;
$$;

REVOKE ALL ON FUNCTION public.get_convention_lifecycle_health_counts(
  uuid[],
  jsonb,
  timestamp with time zone,
  timestamp with time zone
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_convention_lifecycle_health_counts(
  uuid[],
  jsonb,
  timestamp with time zone,
  timestamp with time zone
) TO service_role;
