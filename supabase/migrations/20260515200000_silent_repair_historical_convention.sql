-- Phase 1.5 historical convention silent repair.
--
-- This is explicit service-role repair tooling for already-broken historical
-- conventions. It must not generate recaps or player notifications.

CREATE OR REPLACE FUNCTION public.silent_repair_historical_convention(
  p_convention_id uuid,
  p_actor_id uuid,
  p_reason text
)
RETURNS TABLE (
  repaired boolean,
  convention_id uuid,
  previous_status text,
  final_status text,
  counts jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_convention public.conventions%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_repaired_at timestamp with time zone := now();
  v_closed_at timestamp with time zone;
  v_archived_at timestamp with time zone;
  v_participant_recaps_count integer := 0;
  v_recap_ready_notifications_count integer := 0;
  v_profile_memberships_finalized integer := 0;
  v_profile_memberships_stamped integer := 0;
  v_fursuit_assignments_finalized integer := 0;
  v_fursuit_assignments_stamped integer := 0;
  v_counts jsonb;
  v_summary jsonb;
BEGIN
  IF p_convention_id IS NULL THEN
    RAISE EXCEPTION 'convention_id is required';
  END IF;

  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id is required';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'repair reason is required';
  END IF;

  SELECT *
    INTO v_convention
  FROM public.conventions c
  WHERE c.id = p_convention_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convention not found';
  END IF;

  SELECT COUNT(*)::integer
    INTO v_participant_recaps_count
  FROM public.convention_participant_recaps cpr
  WHERE cpr.convention_id = p_convention_id;

  SELECT COUNT(*)::integer
    INTO v_recap_ready_notifications_count
  FROM public.notifications n
  WHERE n.type = 'convention_recap_ready'
    AND n.payload ->> 'convention_id' = p_convention_id::text;

  IF v_convention.status IN ('draft', 'scheduled', 'live', 'finalizing', 'closeout_running', 'canceled') THEN
    RAISE EXCEPTION 'Silent repair is not allowed for convention status %', v_convention.status;
  END IF;

  IF v_convention.status = 'archived'
    AND v_convention.closeout_error IS NULL
    AND v_participant_recaps_count > 0
  THEN
    RAISE EXCEPTION 'Archived convention does not have stale closeout state to repair';
  END IF;

  IF v_convention.status NOT IN ('closed', 'closeout_failed', 'archived') THEN
    RAISE EXCEPTION 'Silent repair is not allowed for convention status %', v_convention.status;
  END IF;

  v_closed_at := COALESCE(v_convention.closed_at, v_convention.finalizing_started_at, v_repaired_at);
  v_archived_at := COALESCE(v_convention.archived_at, v_repaired_at);

  UPDATE public.profile_conventions pc
     SET attendance_state = 'finalized',
         active_until = v_archived_at,
         finalized_at = v_archived_at
   WHERE pc.convention_id = p_convention_id
     AND pc.attendance_state = 'active'
     AND pc.active_until IS NULL;
  GET DIAGNOSTICS v_profile_memberships_finalized = ROW_COUNT;

  UPDATE public.profile_conventions pc
     SET finalized_at = v_archived_at
   WHERE pc.convention_id = p_convention_id
     AND pc.attendance_state IN ('left', 'removed')
     AND pc.finalized_at IS NULL;
  GET DIAGNOSTICS v_profile_memberships_stamped = ROW_COUNT;

  UPDATE public.fursuit_conventions fc
     SET roster_state = 'finalized',
         active_until = v_archived_at,
         finalized_at = v_archived_at
   WHERE fc.convention_id = p_convention_id
     AND fc.roster_state = 'active'
     AND fc.active_until IS NULL;
  GET DIAGNOSTICS v_fursuit_assignments_finalized = ROW_COUNT;

  UPDATE public.fursuit_conventions fc
     SET finalized_at = v_archived_at
   WHERE fc.convention_id = p_convention_id
     AND fc.roster_state = 'removed'
     AND fc.finalized_at IS NULL;
  GET DIAGNOSTICS v_fursuit_assignments_stamped = ROW_COUNT;

  v_counts := jsonb_build_object(
    'participant_recaps_existing', v_participant_recaps_count,
    'recap_ready_notifications_existing', v_recap_ready_notifications_count,
    'recaps_generated', 0,
    'notifications_created', 0,
    'profile_memberships_finalized', v_profile_memberships_finalized,
    'historical_profile_memberships_stamped', v_profile_memberships_stamped,
    'fursuit_assignments_finalized', v_fursuit_assignments_finalized,
    'historical_fursuit_assignments_stamped', v_fursuit_assignments_stamped
  );

  v_summary := COALESCE(v_convention.closeout_summary, '{}'::jsonb)
    || jsonb_build_object(
      'silent_repair', true,
      'silent_repaired_at', v_repaired_at,
      'silent_repair_reason', v_reason,
      'silent_repair_actor_id', p_actor_id,
      'previous_status', v_convention.status,
      'previous_closeout_error', v_convention.closeout_error,
      'recaps_generated', 0,
      'notifications_created', 0,
      'recap_notifications_created', 0,
      'participant_recaps_existing', v_participant_recaps_count,
      'recap_ready_notifications_existing', v_recap_ready_notifications_count,
      'profile_memberships_finalized', v_profile_memberships_finalized,
      'historical_profile_memberships_stamped', v_profile_memberships_stamped,
      'fursuit_assignments_finalized', v_fursuit_assignments_finalized,
      'historical_fursuit_assignments_stamped', v_fursuit_assignments_stamped
    );

  UPDATE public.conventions c
     SET status = 'archived',
         closed_at = v_closed_at,
         archived_at = v_archived_at,
         closeout_completed_at = COALESCE(c.closeout_completed_at, v_archived_at),
         closeout_last_attempt_at = v_repaired_at,
         closeout_step = 'archived',
         closeout_retry_count = 0,
         closeout_error = NULL,
         closeout_summary = v_summary
   WHERE c.id = p_convention_id;

  INSERT INTO public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    context
  )
  VALUES (
    p_actor_id,
    'silent_repair_historical_convention',
    'convention',
    p_convention_id,
    jsonb_build_object(
      'reason', v_reason,
      'repaired_at', v_repaired_at,
      'previous_status', v_convention.status,
      'previous_closeout_error', v_convention.closeout_error,
      'final_status', 'archived',
      'counts', v_counts,
      'generated_recaps', false,
      'created_notifications', false
    )
  );

  repaired := true;
  convention_id := p_convention_id;
  previous_status := v_convention.status;
  final_status := 'archived';
  counts := v_counts;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.silent_repair_historical_convention(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silent_repair_historical_convention(uuid, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.silent_repair_historical_convention(uuid, uuid, text) IS
  'Archives stale historical closeout failures without generating recaps or player notifications.';
