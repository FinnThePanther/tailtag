BEGIN;

INSERT INTO public.feature_flags (key, description, enabled, rollout_percentage)
VALUES (
  'printable_fursuit_qr',
  'Allow selected players to create, scan, and catch fursuits through printable TailTag QR codes.',
  false,
  0
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_printable_fursuit_qr_enabled_for_profile(
  p_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    auth.role() = 'service_role'
    OR public.is_feature_enabled_for_profile('printable_fursuit_qr', p_profile_id),
    false
  );
$function$;

REVOKE ALL ON FUNCTION public.is_printable_fursuit_qr_enabled_for_profile(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_printable_fursuit_qr_enabled_for_profile(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.require_printable_fursuit_qr_feature()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL
     OR NOT public.is_printable_fursuit_qr_enabled_for_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Printable QR codes are not available for this profile yet';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.require_printable_fursuit_qr_feature()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.require_printable_fursuit_qr_feature()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_qr_asset_object(
  p_viewer_id uuid,
  p_object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_viewer_id IS NOT NULL
    AND public.is_printable_fursuit_qr_enabled_for_profile(p_viewer_id)
    AND (
      split_part(coalesce(p_object_name, ''), '/', 1) = p_viewer_id::text
      OR EXISTS (
        SELECT 1
        FROM public.tags t
        JOIN public.fursuits f ON f.id = t.fursuit_id
        WHERE t.qr_asset_path = p_object_name
          AND f.owner_id = p_viewer_id
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.can_manage_qr_asset_object(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_qr_asset_object(uuid, text)
  TO authenticated, service_role;

ALTER FUNCTION public.list_fursuit_qr_codes(uuid)
  RENAME TO list_fursuit_qr_codes_without_feature_gate;
ALTER FUNCTION public.create_fursuit_qr_code(uuid, text)
  RENAME TO create_fursuit_qr_code_without_feature_gate;
ALTER FUNCTION public.attach_fursuit_qr_asset(uuid, text)
  RENAME TO attach_fursuit_qr_asset_without_feature_gate;
ALTER FUNCTION public.disable_fursuit_qr_code(uuid)
  RENAME TO disable_fursuit_qr_code_without_feature_gate;
ALTER FUNCTION public.replace_fursuit_qr_code(uuid)
  RENAME TO replace_fursuit_qr_code_without_feature_gate;

REVOKE ALL ON FUNCTION public.list_fursuit_qr_codes_without_feature_gate(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_fursuit_qr_code_without_feature_gate(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_fursuit_qr_asset_without_feature_gate(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disable_fursuit_qr_code_without_feature_gate(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_fursuit_qr_code_without_feature_gate(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.list_fursuit_qr_codes(p_fursuit_id uuid)
RETURNS TABLE (
  tag_id uuid,
  fursuit_id uuid,
  label text,
  status text,
  qr_asset_path text,
  created_at timestamptz,
  linked_at timestamptz,
  disabled_at timestamptz,
  expires_at timestamptz,
  replaced_by_tag_id uuid,
  last_scanned_at timestamptz,
  scan_count integer,
  catch_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.require_printable_fursuit_qr_feature();

  RETURN QUERY
  SELECT *
  FROM public.list_fursuit_qr_codes_without_feature_gate(p_fursuit_id);
END;
$function$;

CREATE FUNCTION public.create_fursuit_qr_code(
  p_fursuit_id uuid,
  p_label text DEFAULT NULL
)
RETURNS TABLE (
  tag_id uuid,
  fursuit_id uuid,
  label text,
  status text,
  qr_token text,
  qr_url text,
  qr_asset_path text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.require_printable_fursuit_qr_feature();

  RETURN QUERY
  SELECT *
  FROM public.create_fursuit_qr_code_without_feature_gate(p_fursuit_id, p_label);
END;
$function$;

CREATE FUNCTION public.attach_fursuit_qr_asset(
  p_tag_id uuid,
  p_asset_path text
)
RETURNS TABLE (tag_id uuid, qr_asset_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.require_printable_fursuit_qr_feature();

  RETURN QUERY
  SELECT *
  FROM public.attach_fursuit_qr_asset_without_feature_gate(p_tag_id, p_asset_path);
END;
$function$;

CREATE FUNCTION public.disable_fursuit_qr_code(p_tag_id uuid)
RETURNS TABLE (tag_id uuid, status text, disabled_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.require_printable_fursuit_qr_feature();

  RETURN QUERY
  SELECT *
  FROM public.disable_fursuit_qr_code_without_feature_gate(p_tag_id);
END;
$function$;

CREATE FUNCTION public.replace_fursuit_qr_code(p_tag_id uuid)
RETURNS TABLE (
  old_tag_id uuid,
  tag_id uuid,
  fursuit_id uuid,
  label text,
  status text,
  qr_token text,
  qr_url text,
  qr_asset_path text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.require_printable_fursuit_qr_feature();

  RETURN QUERY
  SELECT *
  FROM public.replace_fursuit_qr_code_without_feature_gate(p_tag_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_fursuit_qr_codes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_fursuit_qr_code(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_fursuit_qr_asset(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disable_fursuit_qr_code(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_fursuit_qr_code(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_fursuit_qr_codes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_fursuit_qr_code(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attach_fursuit_qr_asset(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disable_fursuit_qr_code(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_fursuit_qr_code(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
