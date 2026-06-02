CREATE OR REPLACE FUNCTION public.notify_catch_decision(
  p_catch_id uuid,
  p_catcher_id uuid,
  p_fursuit_id uuid,
  p_fursuit_name text,
  p_decision text,
  p_rejection_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_notification_type text;
  v_can_view_fursuit boolean;
BEGIN
  IF p_decision = 'accept' THEN
    v_notification_type := 'catch_confirmed';
  ELSE
    v_notification_type := 'catch_rejected';
  END IF;

  v_can_view_fursuit := public.can_view_fursuit_as_profile(p_catcher_id, p_fursuit_id);

  PERFORM public.insert_catch_notification_once(
    p_catcher_id,
    v_notification_type,
    jsonb_strip_nulls(
      jsonb_build_object(
        'adult_boundary_checked', true,
        'recipient_role', 'catcher',
        'catch_id', p_catch_id,
        'fursuit_id', p_fursuit_id,
        'fursuit_name',
          CASE WHEN v_can_view_fursuit THEN NULLIF(p_fursuit_name, '') ELSE NULL END,
        'decision', p_decision,
        'rejection_reason', p_rejection_reason
      )
    )
  );
END;
$function$;
