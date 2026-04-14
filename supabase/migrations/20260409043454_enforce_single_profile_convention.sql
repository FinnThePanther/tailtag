-- Enforce a single active convention membership per profile.

-- Keep only the newest convention row for each profile before adding uniqueness.
WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY profile_id
      ORDER BY created_at DESC, convention_id DESC
    ) AS rn
  FROM public.profile_conventions
)
DELETE FROM public.profile_conventions pc
USING ranked r
WHERE pc.ctid = r.ctid
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profile_conventions_profile_id_unique
  ON public.profile_conventions (profile_id);

CREATE OR REPLACE FUNCTION public.opt_in_to_convention(
  p_profile_id uuid,
  p_convention_id uuid,
  p_verified_location jsonb DEFAULT NULL::jsonb,
  p_verification_method text DEFAULT 'none'::text,
  p_override_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_convention RECORD;
  v_verification JSONB;
  v_method TEXT := COALESCE(p_verification_method, 'none');
BEGIN
  SELECT *
  INTO v_convention
  FROM public.conventions
  WHERE id = p_convention_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convention not found';
  END IF;

  -- Enforce verification server-side; never trust client-only gating.
  IF v_convention.location_verification_required THEN
    IF NOT v_convention.geofence_enabled
      OR v_convention.latitude IS NULL
      OR v_convention.longitude IS NULL
    THEN
      RAISE EXCEPTION 'Convention geofence not configured';
    END IF;

    IF v_method = 'manual_override' THEN
      IF p_override_reason IS NULL THEN
        RAISE EXCEPTION 'Override reason required';
      END IF;
      -- RLS restricts overrides to admins; audit columns set below.
    ELSE
      IF p_verified_location IS NULL THEN
        RAISE EXCEPTION 'Location verification required';
      END IF;

      v_verification := public.verify_convention_location(
        p_profile_id,
        p_convention_id,
        (p_verified_location->>'lat')::DOUBLE PRECISION,
        (p_verified_location->>'lng')::DOUBLE PRECISION,
        COALESCE((p_verified_location->>'accuracy')::INTEGER, 0)
      );

      IF (v_verification->>'verified')::BOOLEAN IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Location verification failed: %',
          COALESCE(v_verification->>'error', 'unknown');
      END IF;

      v_method := 'gps';
    END IF;
  ELSE
    IF p_verified_location IS NOT NULL THEN
      v_method := 'gps';
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
    created_at
  )
  VALUES (
    p_profile_id,
    p_convention_id,
    p_verified_location,
    v_method,
    CASE WHEN v_method = 'gps' THEN NOW() ELSE NULL END,
    CASE WHEN v_method = 'manual_override' THEN auth.uid() ELSE NULL END,
    CASE WHEN v_method = 'manual_override' THEN p_override_reason ELSE NULL END,
    CASE WHEN v_method = 'manual_override' THEN NOW() ELSE NULL END,
    NOW()
  )
  ON CONFLICT (profile_id) DO UPDATE
  SET
    convention_id = EXCLUDED.convention_id,
    verified_location = EXCLUDED.verified_location,
    verification_method = EXCLUDED.verification_method,
    verified_at = EXCLUDED.verified_at,
    override_actor_id = EXCLUDED.override_actor_id,
    override_reason = EXCLUDED.override_reason,
    override_at = EXCLUDED.override_at,
    created_at = EXCLUDED.created_at;
END;
$function$;
