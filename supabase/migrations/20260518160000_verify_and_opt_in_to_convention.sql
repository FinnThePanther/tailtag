CREATE OR REPLACE FUNCTION public.verify_convention_location(
  p_profile_id uuid,
  p_convention_id uuid,
  p_user_lat double precision,
  p_user_lng double precision,
  p_accuracy integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_is_admin boolean := auth.role() = 'service_role';
  v_convention RECORD;
  v_distance_meters DECIMAL;
  v_effective_radius INTEGER := NULL;
  v_verified BOOLEAN := false;
  v_error TEXT := NULL;
  v_error_code TEXT := NULL;
  v_profile_role public.user_role := 'player';
  v_accuracy INTEGER := COALESCE(p_accuracy, 0);
BEGIN
  IF NOT v_actor_is_admin THEN
    v_actor_is_admin := COALESCE(public.is_admin(v_actor_id), false);
  END IF;

  IF auth.role() <> 'service_role' AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF auth.role() <> 'service_role' AND v_actor_id IS DISTINCT FROM p_profile_id AND NOT v_actor_is_admin THEN
    RAISE EXCEPTION 'Not authorized to verify convention location for this profile';
  END IF;

  SELECT role
  INTO v_profile_role
  FROM profiles
  WHERE id = p_profile_id;

  SELECT
    id,
    name,
    latitude,
    longitude,
    geofence_radius_meters,
    geofence_enabled,
    location_verification_required
  INTO v_convention
  FROM conventions
  WHERE id = p_convention_id;

  IF NOT FOUND THEN
    v_error := 'Convention not found';
    v_error_code := 'convention_not_found';
    RETURN jsonb_build_object(
      'verified', false,
      'error', v_error,
      'error_code', v_error_code
    );
  END IF;

  IF v_profile_role = 'player' AND (
    SELECT COUNT(*)
    FROM verification_attempts
    WHERE profile_id = p_profile_id
      AND created_at > NOW() - INTERVAL '1 hour'
  ) >= 10 THEN
    v_error := 'Rate limit exceeded';
    v_error_code := 'rate_limited';

    INSERT INTO verification_attempts (
      profile_id,
      convention_id,
      verified,
      distance_meters,
      gps_accuracy,
      error_code
    ) VALUES (
      p_profile_id,
      p_convention_id,
      false,
      NULL,
      v_accuracy,
      v_error_code
    );

    RETURN jsonb_build_object(
      'verified', false,
      'distance_meters', NULL,
      'convention_name', v_convention.name,
      'geofence_radius_meters', v_convention.geofence_radius_meters,
      'effective_radius_meters', v_effective_radius,
      'error', v_error,
      'error_code', v_error_code
    );
  END IF;

  IF NOT v_convention.geofence_enabled OR NOT v_convention.location_verification_required THEN
    v_verified := true;
    v_effective_radius := v_convention.geofence_radius_meters;
  ELSE
    IF v_convention.latitude IS NULL
      OR v_convention.longitude IS NULL
      OR v_convention.geofence_radius_meters IS NULL THEN
      v_error := 'Convention geofence not configured';
      v_error_code := 'geofence_not_configured';
      v_verified := false;
    ELSE
      -- City-wide tolerance: radius + accuracy allowance capped to 5km to prevent extreme spoofing.
      v_effective_radius := v_convention.geofence_radius_meters + LEAST(GREATEST(v_accuracy, 0), 5000);

      v_distance_meters := ST_DistanceSphere(
        ST_MakePoint(p_user_lng, p_user_lat),
        ST_MakePoint(v_convention.longitude, v_convention.latitude)
      );

      v_verified := v_distance_meters <= v_effective_radius;
      IF NOT v_verified THEN
        IF v_accuracy > 5000 THEN
          v_error := 'GPS accuracy too low';
          v_error_code := 'poor_accuracy';
        ELSE
          v_error := 'Outside geofence';
          v_error_code := 'outside_geofence';
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO verification_attempts (
    profile_id,
    convention_id,
    verified,
    distance_meters,
    gps_accuracy,
    error_code
  ) VALUES (
    p_profile_id,
    p_convention_id,
    v_verified,
    v_distance_meters,
    v_accuracy,
    v_error_code
  );

  RETURN jsonb_build_object(
    'verified', v_verified,
    'distance_meters', COALESCE(ROUND(v_distance_meters, 2), NULL),
    'convention_name', v_convention.name,
    'geofence_radius_meters', v_convention.geofence_radius_meters,
    'effective_radius_meters', v_effective_radius,
    'error', v_error,
    'error_code', v_error_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_and_opt_in_to_convention(
  p_profile_id uuid,
  p_convention_id uuid,
  p_verified_location jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_is_admin boolean := auth.role() = 'service_role';
  v_convention record;
  v_verification jsonb;
  v_requires_live_verification boolean := false;
  v_verified boolean := false;
  v_error text := NULL;
  v_error_code text := NULL;
  v_accuracy integer := COALESCE((p_verified_location->>'accuracy')::integer, 0);
  v_was_active_member boolean := false;
BEGIN
  IF NOT v_actor_is_admin THEN
    v_actor_is_admin := COALESCE(public.is_admin(v_actor_id), false);
  END IF;

  IF auth.role() <> 'service_role' AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF auth.role() <> 'service_role' AND v_actor_id IS DISTINCT FROM p_profile_id AND NOT v_actor_is_admin THEN
    RAISE EXCEPTION 'Not authorized to join conventions for this profile';
  END IF;

  SELECT *
    INTO v_convention
    FROM public.conventions
   WHERE id = p_convention_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'verified', false,
      'requires_location_verification', false,
      'distance_meters', NULL,
      'geofence_radius_meters', NULL,
      'effective_radius_meters', NULL,
      'error_code', 'convention_not_found',
      'error', 'Convention not found'
    );
  END IF;

  IF NOT public.is_convention_prejoinable(p_convention_id) THEN
    RETURN jsonb_build_object(
      'verified', false,
      'requires_location_verification', false,
      'distance_meters', NULL,
      'geofence_radius_meters', v_convention.geofence_radius_meters,
      'effective_radius_meters', NULL,
      'error_code', 'registration_closed',
      'error', 'Convention is not open for registration'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.profile_conventions pc
     WHERE pc.profile_id = p_profile_id
       AND pc.convention_id = p_convention_id
       AND pc.attendance_state = 'active'
       AND pc.active_until IS NULL
  )
  INTO v_was_active_member;

  v_requires_live_verification :=
    public.is_convention_joinable(p_convention_id)
    AND COALESCE(v_convention.location_verification_required, false);

  IF v_requires_live_verification THEN
    IF NOT v_convention.geofence_enabled OR v_convention.latitude IS NULL OR v_convention.longitude IS NULL THEN
      RETURN jsonb_build_object(
        'verified', false,
        'requires_location_verification', true,
        'distance_meters', NULL,
        'geofence_radius_meters', v_convention.geofence_radius_meters,
        'effective_radius_meters', NULL,
        'error_code', 'geofence_not_configured',
        'error', 'Convention geofence not configured'
      );
    END IF;

    IF p_verified_location IS NULL
      OR p_verified_location->>'lat' IS NULL
      OR p_verified_location->>'lng' IS NULL THEN
      RETURN jsonb_build_object(
        'verified', false,
        'requires_location_verification', true,
        'distance_meters', NULL,
        'geofence_radius_meters', v_convention.geofence_radius_meters,
        'effective_radius_meters', NULL,
        'error_code', 'location_required',
        'error', 'Location verification required'
      );
    END IF;

    v_verification := public.verify_convention_location(
      p_profile_id,
      p_convention_id,
      (p_verified_location->>'lat')::double precision,
      (p_verified_location->>'lng')::double precision,
      v_accuracy
    );

    v_verified := (v_verification->>'verified')::boolean IS TRUE;

    IF NOT v_verified THEN
      v_error_code := COALESCE(v_verification->>'error_code', 'unknown');
      v_error := COALESCE(v_verification->>'error', 'Location verification failed');

      RETURN jsonb_build_object(
        'verified', false,
        'requires_location_verification', true,
        'distance_meters', (v_verification->>'distance_meters')::numeric,
        'geofence_radius_meters', COALESCE((v_verification->>'geofence_radius_meters')::integer, v_convention.geofence_radius_meters),
        'effective_radius_meters', (v_verification->>'effective_radius_meters')::integer,
        'error_code', v_error_code,
        'error', v_error
      );
    END IF;
  END IF;

  INSERT INTO public.profile_conventions (
    profile_id,
    convention_id,
    verified_location,
    verification_method,
    verified_at,
    override_actor_id,
    override_reason,
    override_at,
    playable_notified_at,
    attendance_state,
    left_at,
    removed_at,
    active_until,
    finalized_at,
    created_at
  )
  VALUES (
    p_profile_id,
    p_convention_id,
    CASE WHEN v_requires_live_verification THEN p_verified_location ELSE NULL END,
    CASE WHEN v_requires_live_verification THEN 'gps' ELSE 'none' END,
    CASE WHEN v_requires_live_verification THEN now() ELSE NULL END,
    NULL,
    NULL,
    NULL,
    NULL,
    'active',
    NULL,
    NULL,
    NULL,
    NULL,
    now()
  )
  ON CONFLICT (profile_id, convention_id) DO UPDATE
  SET
    verified_location = EXCLUDED.verified_location,
    verification_method = EXCLUDED.verification_method,
    verified_at = EXCLUDED.verified_at,
    override_actor_id = NULL,
    override_reason = NULL,
    override_at = NULL,
    playable_notified_at = NULL,
    attendance_state = 'active',
    left_at = NULL,
    removed_at = NULL,
    active_until = NULL,
    finalized_at = NULL;

  IF NOT v_was_active_member THEN
    INSERT INTO public.fursuit_conventions (
      fursuit_id,
      convention_id,
      roster_visible,
      roster_state,
      removed_at,
      active_until,
      finalized_at
    )
    SELECT
      f.id,
      p_convention_id,
      true,
      'active',
      NULL,
      NULL,
      NULL
    FROM public.fursuits f
    WHERE f.owner_id = p_profile_id
      AND f.is_tutorial = false
    ON CONFLICT (fursuit_id, convention_id) DO UPDATE
    SET
      roster_visible = true,
      roster_state = 'active',
      removed_at = NULL,
      active_until = NULL,
      finalized_at = NULL;
  END IF;

  RETURN jsonb_build_object(
    'verified', true,
    'requires_location_verification', v_requires_live_verification,
    'distance_meters', CASE WHEN v_verification IS NULL THEN NULL ELSE (v_verification->>'distance_meters')::numeric END,
    'geofence_radius_meters', v_convention.geofence_radius_meters,
    'effective_radius_meters', CASE WHEN v_verification IS NULL THEN NULL ELSE (v_verification->>'effective_radius_meters')::integer END,
    'error_code', NULL,
    'error', NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_and_opt_in_to_convention(uuid, uuid, jsonb)
  TO authenticated, service_role;
