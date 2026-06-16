CREATE OR REPLACE FUNCTION public.set_own_age_attestation(
  p_is_adult boolean,
  p_age_gate_version integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profile_id uuid := auth.uid();
  v_current_age_gate_version constant integer := 1;
  v_supported_age_gate_versions constant integer[] := ARRAY[1];
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to save age attestation'
      USING ERRCODE = '42501';
  END IF;

  IF p_is_adult IS NULL THEN
    RAISE EXCEPTION 'Age attestation value is required'
      USING ERRCODE = '22004';
  END IF;

  IF p_age_gate_version IS NULL OR p_age_gate_version < 1 THEN
    RAISE EXCEPTION 'Age gate version must be positive'
      USING ERRCODE = '22023';
  END IF;

  IF NOT p_age_gate_version = ANY (v_supported_age_gate_versions) THEN
    RAISE EXCEPTION 'Unsupported age gate version'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET
    is_adult = p_is_adult,
    age_gate_version = v_current_age_gate_version,
    visibility_audience = CASE
      WHEN p_is_adult THEN visibility_audience
      ELSE 'everyone'
    END,
    updated_at = now()
  WHERE id = v_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for current user'
      USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_own_age_attestation(boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_own_age_attestation(boolean, integer) TO authenticated, service_role;
