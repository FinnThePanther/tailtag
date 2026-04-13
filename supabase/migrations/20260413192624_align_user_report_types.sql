CREATE OR REPLACE FUNCTION public.submit_user_report(
  p_reported_user_id uuid DEFAULT NULL::uuid,
  p_reported_fursuit_id uuid DEFAULT NULL::uuid,
  p_report_type text DEFAULT 'other'::text,
  p_description text DEFAULT ''::text,
  p_severity text DEFAULT 'medium'::text,
  p_convention_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reporter_id uuid := auth.uid();
  v_recent_count integer;
  v_report_id uuid;
BEGIN
  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_reported_user_id IS NULL AND p_reported_fursuit_id IS NULL THEN
    RAISE EXCEPTION 'Must specify a reported user or fursuit';
  END IF;

  IF p_reported_user_id = v_reporter_id THEN
    RAISE EXCEPTION 'Cannot report yourself';
  END IF;

  IF p_report_type NOT IN ('inappropriate_content', 'harassment', 'cheating', 'spam', 'other') THEN
    RAISE EXCEPTION 'Invalid report type';
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM public.user_reports
  WHERE reporter_id = v_reporter_id
    AND created_at > now() - interval '24 hours';

  IF v_recent_count >= 5 THEN
    RAISE EXCEPTION 'Report limit reached. You can submit more reports in 24 hours.';
  END IF;

  INSERT INTO public.user_reports (
    reporter_id,
    reported_user_id,
    reported_fursuit_id,
    report_type,
    description,
    severity,
    convention_id,
    status
  ) VALUES (
    v_reporter_id,
    p_reported_user_id,
    p_reported_fursuit_id,
    p_report_type,
    p_description,
    'medium',
    p_convention_id,
    'pending'
  )
  RETURNING id INTO v_report_id;

  RETURN v_report_id;
END;
$function$;

ALTER TABLE public.user_reports
DROP CONSTRAINT IF EXISTS user_reports_report_type_check;

ALTER TABLE public.user_reports
ADD CONSTRAINT user_reports_report_type_check
CHECK (
  report_type = ANY (
    ARRAY[
      'inappropriate_content'::text,
      'harassment'::text,
      'cheating'::text,
      'spam'::text,
      'other'::text
    ]
  )
) NOT VALID;

ALTER TABLE public.user_reports
VALIDATE CONSTRAINT user_reports_report_type_check;
