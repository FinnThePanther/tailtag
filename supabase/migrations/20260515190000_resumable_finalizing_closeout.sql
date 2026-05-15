-- Phase 1.4 convention ending lifecycle closeout support.
--
-- Finalizing conventions now close through resumable backend steps instead of
-- the legacy one-shot live/closed archive path.

CREATE OR REPLACE FUNCTION public.expire_pending_catches_for_convention_closeout(
  p_convention_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_expired_catches json;
  v_stale_pending_upload_count integer := 0;
BEGIN
  IF p_convention_id IS NULL THEN
    RAISE EXCEPTION 'convention_id is required';
  END IF;

  UPDATE public.catches c
     SET status = 'EXPIRED',
         photo_upload_state = 'failed',
         decided_at = now()
   WHERE c.convention_id = p_convention_id
     AND c.status = 'PENDING'
     AND c.catch_photo_source IS NOT NULL
     AND c.photo_upload_state = 'pending_upload'
     AND c.catch_photo_url IS NULL;

  GET DIAGNOSTICS v_stale_pending_upload_count = ROW_COUNT;

  WITH expired AS (
    UPDATE public.catches c
       SET status = 'EXPIRED',
           decided_at = now()
     WHERE c.convention_id = p_convention_id
       AND c.status = 'PENDING'
       AND (c.catch_photo_source IS NULL OR c.catch_photo_url IS NOT NULL)
     RETURNING
       c.id,
       c.catcher_id,
       c.convention_id,
       c.fursuit_id,
       (SELECT f.name FROM public.fursuits f WHERE f.id = c.fursuit_id) AS fursuit_name,
       (SELECT f.owner_id FROM public.fursuits f WHERE f.id = c.fursuit_id) AS owner_id,
       (SELECT p.username FROM public.profiles p WHERE p.id = c.catcher_id) AS catcher_username
  ),
  catch_notifications AS (
    SELECT
      expired.id,
      public.insert_catch_notification_once(
        expired.catcher_id,
        'catch_expired',
        jsonb_build_object(
          'fursuit_name', COALESCE(NULLIF(expired.fursuit_name, ''), 'a fursuit'),
          'catch_id', expired.id
        )
      )
    FROM expired
    WHERE expired.catcher_id IS NOT NULL
  ),
  owner_notifications AS (
    SELECT
      expired.id,
      public.insert_catch_notification_once(
        expired.owner_id,
        'catch_expired',
        jsonb_build_object(
          'fursuit_name', COALESCE(NULLIF(expired.fursuit_name, ''), 'a fursuit'),
          'catcher_username', COALESCE(NULLIF(expired.catcher_username, ''), 'Someone'),
          'catch_id', expired.id
        )
      )
    FROM expired
    WHERE expired.owner_id IS NOT NULL
  ),
  gameplay_events AS (
    SELECT
      expired.id
    FROM expired
    CROSS JOIN LATERAL public.ingest_gameplay_event(
        'catch_expired',
        expired.catcher_id,
        expired.convention_id,
        jsonb_build_object(
          'catch_id', expired.id,
          'fursuit_id', expired.fursuit_id,
          'catcher_id', expired.catcher_id,
          'owner_id', expired.owner_id
        ),
        now(),
        'catch:' || expired.id::text || ':expired'
      ) AS gameplay_event
    WHERE expired.catcher_id IS NOT NULL
  ),
  side_effects AS (
    SELECT
      (SELECT count(*) FROM catch_notifications) AS catcher_notification_count,
      (SELECT count(*) FROM owner_notifications) AS owner_notification_count,
      (SELECT count(*) FROM gameplay_events) AS gameplay_event_count
  )
  SELECT json_agg(expired) INTO v_expired_catches
  FROM expired
  CROSS JOIN side_effects;

  RETURN json_build_object(
    'success', true,
    'expired_count', COALESCE(json_array_length(v_expired_catches), 0),
    'stale_pending_upload_count', v_stale_pending_upload_count,
    'expired_catches', COALESCE(v_expired_catches, '[]'::json),
    'timestamp', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_pending_catches_for_convention_closeout(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pending_catches_for_convention_closeout(uuid)
  TO service_role;

COMMENT ON FUNCTION public.expire_pending_catches_for_convention_closeout(uuid) IS
  'Expires all pending catches for one convention during final closeout and records normal catch-expired notifications/events.';

WITH ranked_recap_notifications AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, type, payload ->> 'recap_id'
      ORDER BY created_at ASC, id ASC
    ) AS duplicate_rank
  FROM public.notifications
  WHERE type = 'convention_recap_ready'
    AND payload ->> 'recap_id' IS NOT NULL
    AND payload ->> 'recap_id' <> ''
)
DELETE FROM public.notifications n
USING ranked_recap_notifications ranked
WHERE n.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_convention_recap_ready_once_idx
  ON public.notifications (
    user_id,
    type,
    ((payload ->> 'recap_id'))
  )
  WHERE type = 'convention_recap_ready'
    AND payload ->> 'recap_id' IS NOT NULL
    AND payload ->> 'recap_id' <> '';

CREATE OR REPLACE FUNCTION public.insert_convention_recap_ready_notification_once(
  p_user_id uuid,
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_inserted_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing notification user_id';
  END IF;

  IF p_payload IS NULL
    OR p_payload ->> 'recap_id' IS NULL
    OR p_payload ->> 'recap_id' = ''
  THEN
    RAISE EXCEPTION 'Recap notification payload requires recap_id';
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    payload
  )
  VALUES (
    p_user_id,
    'convention_recap_ready',
    p_payload
  )
  ON CONFLICT (
    user_id,
    type,
    ((payload ->> 'recap_id'))
  )
  WHERE type = 'convention_recap_ready'
    AND payload ->> 'recap_id' IS NOT NULL
    AND payload ->> 'recap_id' <> ''
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  RETURN v_inserted_id IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_convention_recap_ready_notification_once(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_convention_recap_ready_notification_once(uuid, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.insert_convention_recap_ready_notification_once(uuid, jsonb) IS
  'Creates one recap-ready notification per user and recap id for convention closeout.';

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
      PERFORM net.http_post(
        url                  := v_closeout_url,
        headers              := v_headers,
        body                 := jsonb_build_object(
          'convention_id', convention.id::text,
          'source', convention.source
        ),
        timeout_milliseconds := 10000
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'convention lifecycle closeout failed for convention %: %', convention.id, SQLERRM;
    END;
  END LOOP;

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
      PERFORM net.http_post(
        url                  := v_closeout_url,
        headers              := v_headers,
        body                 := jsonb_build_object(
          'convention_id', convention.id::text,
          'source', convention.source
        ),
        timeout_milliseconds := 10000
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'convention lifecycle retry failed for convention %: %', convention.id, SQLERRM;
    END;
  END LOOP;

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
      PERFORM net.http_post(
        url                  := v_closeout_url,
        headers              := v_headers,
        body                 := jsonb_build_object(
          'convention_id', convention.id::text,
          'source', convention.source
        ),
        timeout_milliseconds := 10000
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'legacy convention lifecycle retry failed for convention %: %', convention.id, SQLERRM;
    END;
  END LOOP;
END;
$$;
