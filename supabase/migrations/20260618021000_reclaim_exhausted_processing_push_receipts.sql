BEGIN;

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

COMMENT ON FUNCTION public.claim_notification_push_receipts(text, integer) IS
  'Claims eligible Expo push receipts with row locking for service-role workers.';

COMMIT;
