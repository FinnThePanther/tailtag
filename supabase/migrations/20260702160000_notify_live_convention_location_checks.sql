-- Notify pre-enrolled attendees when a location-verified convention becomes
-- playable and they still need their live on-site check.

CREATE OR REPLACE FUNCTION app_private.notify_live_convention_location_checks(
  p_now timestamp with time zone DEFAULT now()
)
RETURNS TABLE (
  convention_id uuid,
  notifications_inserted integer,
  attendees_marked integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'app_private', 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  WITH live_conventions AS (
    SELECT
      c.id,
      c.name,
      c.location_verification_required,
      COALESCE(
        c.started_at,
        c.start_date::timestamp AT TIME ZONE COALESCE(
          (
            SELECT timezone_info.name
            FROM pg_timezone_names timezone_info
            WHERE timezone_info.name = NULLIF(btrim(c.timezone), '')
            LIMIT 1
          ),
          'UTC'
        )
      ) AS effective_started_at
    FROM public.conventions c
    WHERE public.is_convention_joinable(c.id)
      AND COALESCE(c.location_verification_required, false) = true
      AND COALESCE(c.geofence_enabled, false) = true
      AND c.latitude IS NOT NULL
      AND c.longitude IS NOT NULL
  ),
  targets AS (
    SELECT
      pc.profile_id,
      pc.convention_id,
      live_conventions.name AS convention_name,
      live_conventions.location_verification_required
    FROM public.profile_conventions pc
    JOIN live_conventions
      ON live_conventions.id = pc.convention_id
    JOIN public.profiles p
      ON p.id = pc.profile_id
     AND p.push_notifications_enabled = true
     AND NULLIF(btrim(p.expo_push_token), '') IS NOT NULL
    WHERE pc.attendance_state = 'active'
      AND pc.active_until IS NULL
      AND pc.playable_notified_at IS NULL
      AND live_conventions.effective_started_at IS NOT NULL
      AND pc.created_at < live_conventions.effective_started_at
      AND public.is_profile_convention_gameplay_eligible(pc.profile_id, pc.convention_id) IS NOT TRUE
  ),
  notifications_inserted AS (
    INSERT INTO public.notifications (
      user_id,
      type,
      payload,
      dedupe_key
    )
    SELECT
      targets.profile_id,
      'convention_started',
      jsonb_strip_nulls(
        jsonb_build_object(
          'convention_id', targets.convention_id,
          'convention_name', NULLIF(targets.convention_name, ''),
          'location_verification_required', targets.location_verification_required
        )
      ),
      'convention-started-location-check:' || targets.convention_id::text
    FROM targets
    ON CONFLICT (
      user_id,
      type,
      dedupe_key
    )
    WHERE dedupe_key IS NOT NULL
    DO NOTHING
    RETURNING user_id, (payload->>'convention_id')::uuid AS convention_id
  ),
  marked AS (
    UPDATE public.profile_conventions pc
       SET playable_notified_at = p_now
      FROM targets
     WHERE pc.profile_id = targets.profile_id
       AND pc.convention_id = targets.convention_id
       AND pc.playable_notified_at IS NULL
     RETURNING pc.profile_id, pc.convention_id
  ),
  convention_ids AS (
    SELECT targets.convention_id
    FROM targets
    UNION
    SELECT notifications_inserted.convention_id
    FROM notifications_inserted
    UNION
    SELECT marked.convention_id
    FROM marked
  )
  SELECT
    convention_ids.convention_id,
    COALESCE(
      (
        SELECT count(*)::integer
        FROM notifications_inserted inserted
        WHERE inserted.convention_id = convention_ids.convention_id
      ),
      0
    ) AS notifications_inserted,
    COALESCE(
      (
        SELECT count(*)::integer
        FROM marked
        WHERE marked.convention_id = convention_ids.convention_id
      ),
      0
    ) AS attendees_marked
  FROM convention_ids
  ORDER BY convention_ids.convention_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION app_private.notify_live_convention_location_checks(timestamp with time zone)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.notify_live_convention_location_checks(timestamp with time zone)
  TO service_role;

COMMENT ON FUNCTION app_private.notify_live_convention_location_checks(timestamp with time zone) IS
  'Creates idempotent convention_started notifications for pre-enrolled push-enabled attendees who need live location verification.';

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

  -- 2. Notify pre-enrolled attendees that their live location check is ready.
  BEGIN
    PERFORM app_private.notify_live_convention_location_checks();
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'convention_lifecycle_automation_job: location-check notification failed: %', SQLERRM;
  END;

  -- 3. Transition ended live conventions into finalizing.
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

  -- 4. Close out finalizing conventions that have reached their 9:00 AM local deadline.
  FOR convention IN
    SELECT
      c.id,
      'cron_close'::text AS source
    FROM public.conventions c
    WHERE c.status = 'finalizing'
      AND c.closeout_not_before IS NOT NULL
      AND c.closeout_not_before <= now()
      AND (
        c.closeout_last_attempt_at IS NULL
        OR c.closeout_last_attempt_at < now() - interval '1 hour'
      )
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
        RAISE WARNING 'convention lifecycle closeout dispatch failed for convention %: %', convention.id, SQLERRM;
    END;
  END LOOP;

  -- 5. Retry failed closeouts.
  FOR convention IN
    SELECT
      c.id,
      'cron_retry'::text AS source
    FROM public.conventions c
    WHERE c.status = 'closeout_failed'
      AND c.closeout_retry_count < 5
      AND (
        c.closeout_last_attempt_at IS NULL
        OR c.closeout_last_attempt_at < now() - interval '1 hour'
      )
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
        RAISE WARNING 'convention lifecycle retry dispatch failed for convention %: %', convention.id, SQLERRM;
    END;
  END LOOP;

  -- 6. Retry legacy closed conventions.
  FOR convention IN
    SELECT
      c.id,
      'cron_retry'::text AS source
    FROM public.conventions c
    WHERE c.status = 'closed'
      AND (c.closeout_error IS NOT NULL OR c.archived_at IS NULL)
      AND (
        c.closeout_last_attempt_at IS NULL
        OR c.closeout_last_attempt_at < now() - interval '6 hours'
      )
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
        RAISE WARNING 'legacy convention lifecycle retry dispatch failed for convention %: %', convention.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

DO $$
BEGIN
  PERFORM app_private.notify_live_convention_location_checks();
END;
$$;
