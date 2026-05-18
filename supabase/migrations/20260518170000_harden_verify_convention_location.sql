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
