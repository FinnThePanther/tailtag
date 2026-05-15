-- Phase 1.2 convention ending lifecycle durable attendance and roster history.
--
-- Membership and roster rows become durable history. Active gameplay/read
-- behavior must filter explicit state instead of relying on row existence.

ALTER TABLE public.profile_conventions
  ADD COLUMN IF NOT EXISTS left_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS removed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS active_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS attendance_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS finalized_at timestamp with time zone;

ALTER TABLE public.fursuit_conventions
  ADD COLUMN IF NOT EXISTS removed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS active_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS roster_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS finalized_at timestamp with time zone;

ALTER TABLE public.profile_conventions
  DROP CONSTRAINT IF EXISTS profile_conventions_attendance_state_check,
  ADD CONSTRAINT profile_conventions_attendance_state_check
  CHECK (attendance_state IN ('active', 'left', 'removed', 'finalized'));

ALTER TABLE public.fursuit_conventions
  DROP CONSTRAINT IF EXISTS fursuit_conventions_roster_state_check,
  ADD CONSTRAINT fursuit_conventions_roster_state_check
  CHECK (roster_state IN ('active', 'removed', 'finalized'));

CREATE INDEX IF NOT EXISTS profile_conventions_profile_state_created_idx
  ON public.profile_conventions (profile_id, attendance_state, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_conventions_convention_state_idx
  ON public.profile_conventions (convention_id, attendance_state);

CREATE INDEX IF NOT EXISTS fursuit_conventions_fursuit_state_idx
  ON public.fursuit_conventions (fursuit_id, roster_state);

CREATE INDEX IF NOT EXISTS fursuit_conventions_convention_state_idx
  ON public.fursuit_conventions (convention_id, roster_state);

CREATE OR REPLACE FUNCTION public.is_profile_convention_gameplay_eligible(
  p_profile_id uuid,
  p_convention_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_conventions pc
    JOIN public.conventions c ON c.id = pc.convention_id
    WHERE pc.profile_id = p_profile_id
      AND pc.convention_id = p_convention_id
      AND pc.attendance_state = 'active'
      AND pc.active_until IS NULL
      AND public.is_convention_joinable(pc.convention_id)
      AND (
        COALESCE(c.location_verification_required, false) = false
        OR pc.verification_method = 'grandfathered'
        OR (pc.verification_method = 'manual_override' AND pc.override_at IS NOT NULL)
        OR (
          pc.verification_method = 'gps'
          AND pc.verified_at IS NOT NULL
          AND (c.started_at IS NULL OR pc.verified_at >= c.started_at)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_profile_convention_gallery_catch_eligible(
  p_profile_id uuid,
  p_convention_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_conventions pc
    JOIN public.conventions c ON c.id = pc.convention_id
    WHERE pc.profile_id = p_profile_id
      AND pc.convention_id = p_convention_id
      AND pc.attendance_state = 'active'
      AND pc.active_until IS NULL
      AND public.is_convention_gallery_catchable(pc.convention_id)
      AND (
        COALESCE(c.location_verification_required, false) = false
        OR pc.verification_method = 'grandfathered'
        OR (pc.verification_method = 'manual_override' AND pc.override_at IS NOT NULL)
        OR (
          pc.verification_method = 'gps'
          AND pc.verified_at IS NOT NULL
          AND (c.started_at IS NULL OR pc.verified_at >= c.started_at)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_convention_memberships()
RETURNS TABLE (
  convention_id uuid,
  id uuid,
  slug text,
  name text,
  location text,
  start_date date,
  end_date date,
  timezone text,
  latitude numeric,
  longitude numeric,
  geofence_radius_meters integer,
  geofence_enabled boolean,
  location_verification_required boolean,
  status text,
  local_day date,
  is_joinable boolean,
  joined_at timestamp with time zone,
  verification_method text,
  verified_at timestamp with time zone,
  override_at timestamp with time zone,
  playable_notified_at timestamp with time zone,
  membership_state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    pc.convention_id,
    c.id,
    c.slug,
    c.name,
    c.location,
    c.start_date,
    c.end_date,
    COALESCE(NULLIF(c.timezone, ''), 'UTC') AS timezone,
    c.latitude,
    c.longitude,
    c.geofence_radius_meters,
    COALESCE(c.geofence_enabled, false) AS geofence_enabled,
    COALESCE(c.location_verification_required, false) AS location_verification_required,
    c.status,
    info.local_day,
    public.is_convention_joinable(c.id) AS is_joinable,
    pc.created_at AS joined_at,
    pc.verification_method,
    pc.verified_at,
    pc.override_at,
    pc.playable_notified_at,
    CASE
      WHEN c.status IN ('closed', 'archived', 'canceled')
        OR (c.end_date IS NOT NULL AND info.local_day > c.end_date + 3)
        THEN 'past'
      WHEN c.start_date IS NOT NULL AND info.local_day < c.start_date
        THEN 'upcoming'
      WHEN c.status = 'scheduled'
        THEN 'awaiting_start'
      WHEN public.is_convention_joinable(c.id)
        AND COALESCE(c.location_verification_required, false)
        AND NOT public.is_profile_convention_gameplay_eligible(pc.profile_id, c.id)
        THEN 'needs_location_verification'
      WHEN public.is_profile_convention_gameplay_eligible(pc.profile_id, c.id)
        THEN 'active'
      WHEN public.is_convention_leaderboard_visible(c.id)
        THEN 'leaderboard_open'
      ELSE 'awaiting_start'
    END AS membership_state
  FROM public.profile_conventions pc
  JOIN public.conventions c ON c.id = pc.convention_id
  CROSS JOIN LATERAL (
    SELECT timezone(COALESCE(NULLIF(c.timezone, ''), 'UTC'), now())::date AS local_day
  ) info
  WHERE pc.profile_id = auth.uid()
    AND pc.attendance_state = 'active'
    AND pc.active_until IS NULL
  ORDER BY
    CASE
      WHEN public.is_profile_convention_gameplay_eligible(pc.profile_id, c.id) THEN 0
      WHEN public.is_convention_leaderboard_visible(c.id) THEN 1
      WHEN c.status IN ('closed', 'archived', 'canceled')
        OR (c.end_date IS NOT NULL AND info.local_day > c.end_date + 3) THEN 3
      ELSE 2
    END,
    c.start_date ASC NULLS LAST,
    pc.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_active_profile_convention_ids(p_profile_id uuid)
RETURNS TABLE (convention_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT pc.convention_id
  FROM public.profile_conventions pc
  JOIN public.conventions c ON c.id = pc.convention_id
  WHERE pc.profile_id = p_profile_id
    AND pc.attendance_state = 'active'
    AND pc.active_until IS NULL
    AND public.is_profile_convention_gameplay_eligible(pc.profile_id, pc.convention_id)
  ORDER BY c.start_date ASC NULLS LAST, pc.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_active_shared_convention_ids(
  p_profile_id uuid,
  p_fursuit_id uuid
)
RETURNS TABLE (convention_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT pc.convention_id
  FROM public.profile_conventions pc
  JOIN public.fursuit_conventions fc
    ON fc.convention_id = pc.convention_id
   AND fc.fursuit_id = p_fursuit_id
  JOIN public.fursuits f ON f.id = fc.fursuit_id
  JOIN public.conventions c ON c.id = pc.convention_id
  WHERE pc.profile_id = p_profile_id
    AND pc.attendance_state = 'active'
    AND pc.active_until IS NULL
    AND fc.roster_state = 'active'
    AND fc.active_until IS NULL
    AND public.is_profile_convention_gameplay_eligible(p_profile_id, pc.convention_id)
    AND public.is_profile_convention_gameplay_eligible(f.owner_id, pc.convention_id)
  ORDER BY c.start_date ASC NULLS LAST, pc.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_gallery_profile_convention_ids(p_profile_id uuid)
RETURNS TABLE (convention_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT pc.convention_id
  FROM public.profile_conventions pc
  JOIN public.conventions c ON c.id = pc.convention_id
  WHERE pc.profile_id = p_profile_id
    AND pc.attendance_state = 'active'
    AND pc.active_until IS NULL
    AND public.is_profile_convention_gallery_catch_eligible(pc.profile_id, pc.convention_id)
  ORDER BY c.start_date ASC NULLS LAST, pc.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_gallery_shared_convention_ids(
  p_profile_id uuid,
  p_fursuit_id uuid
)
RETURNS TABLE (convention_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT pc.convention_id
  FROM public.profile_conventions pc
  JOIN public.fursuit_conventions fc
    ON fc.convention_id = pc.convention_id
   AND fc.fursuit_id = p_fursuit_id
  JOIN public.fursuits f ON f.id = fc.fursuit_id
  JOIN public.conventions c ON c.id = pc.convention_id
  WHERE pc.profile_id = p_profile_id
    AND pc.attendance_state = 'active'
    AND pc.active_until IS NULL
    AND fc.roster_state = 'active'
    AND fc.active_until IS NULL
    AND public.is_profile_convention_gallery_catch_eligible(p_profile_id, pc.convention_id)
    AND public.is_profile_convention_gallery_catch_eligible(f.owner_id, pc.convention_id)
  ORDER BY c.start_date ASC NULLS LAST, pc.created_at DESC;
$$;

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
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_is_admin boolean := auth.role() = 'service_role';
  v_convention record;
  v_verification jsonb;
  v_method text := COALESCE(p_verification_method, 'none');
  v_stored_location jsonb := p_verified_location;
  v_requires_live_verification boolean := false;
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

  IF v_method IN ('manual_override', 'grandfathered') AND NOT v_actor_is_admin THEN
    RAISE EXCEPTION 'Admin privileges required for this verification method';
  END IF;

  SELECT *
    INTO v_convention
    FROM public.conventions
   WHERE id = p_convention_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convention not found';
  END IF;

  IF NOT public.is_convention_prejoinable(p_convention_id) THEN
    RAISE EXCEPTION 'Convention is not open for registration';
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
      RAISE EXCEPTION 'Convention geofence not configured';
    END IF;

    IF v_method IN ('manual_override', 'grandfathered') THEN
      IF v_method = 'manual_override' AND p_override_reason IS NULL THEN
        RAISE EXCEPTION 'Override reason required';
      END IF;
    ELSE
      IF p_verified_location IS NULL THEN
        RAISE EXCEPTION 'Location verification required';
      END IF;

      v_verification := public.verify_convention_location(
        p_profile_id,
        p_convention_id,
        (p_verified_location->>'lat')::double precision,
        (p_verified_location->>'lng')::double precision,
        COALESCE((p_verified_location->>'accuracy')::integer, 0)
      );

      IF (v_verification->>'verified')::boolean IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Location verification failed: %', COALESCE(v_verification->>'error', 'unknown');
      END IF;

      v_method := 'gps';
      v_stored_location := p_verified_location;
    END IF;
  ELSE
    IF v_method NOT IN ('manual_override', 'grandfathered') THEN
      v_method := 'none';
      v_stored_location := NULL;
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
    v_stored_location,
    v_method,
    CASE WHEN v_method = 'gps' THEN now() ELSE NULL END,
    CASE WHEN v_method = 'manual_override' THEN auth.uid() ELSE NULL END,
    CASE WHEN v_method = 'manual_override' THEN p_override_reason ELSE NULL END,
    CASE WHEN v_method = 'manual_override' THEN now() ELSE NULL END,
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
    override_actor_id = EXCLUDED.override_actor_id,
    override_reason = EXCLUDED.override_reason,
    override_at = EXCLUDED.override_at,
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
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_convention(
  p_profile_id uuid,
  p_convention_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_is_admin boolean := auth.role() = 'service_role';
BEGIN
  IF auth.role() <> 'service_role' AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT v_actor_is_admin THEN
    v_actor_is_admin := COALESCE(public.is_admin(v_actor_id), false);
  END IF;

  IF auth.role() <> 'service_role' AND v_actor_id IS DISTINCT FROM p_profile_id AND NOT v_actor_is_admin THEN
    RAISE EXCEPTION 'Not authorized to leave conventions for this profile';
  END IF;

  UPDATE public.fursuit_conventions fc
     SET roster_state = 'removed',
         removed_at = now(),
         active_until = now(),
         finalized_at = NULL
    FROM public.fursuits f
   WHERE fc.fursuit_id = f.id
     AND f.owner_id = p_profile_id
     AND fc.convention_id = p_convention_id
     AND fc.roster_state = 'active'
     AND fc.active_until IS NULL;

  UPDATE public.profile_conventions pc
     SET attendance_state = 'left',
         left_at = now(),
         removed_at = NULL,
         active_until = now(),
         finalized_at = NULL
   WHERE pc.profile_id = p_profile_id
     AND pc.convention_id = p_convention_id
     AND pc.attendance_state = 'active'
     AND pc.active_until IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_joinable_fursuit_convention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_owner_id uuid;
  v_convention_exists boolean;
BEGIN
  SELECT f.owner_id
    INTO v_owner_id
    FROM public.fursuits f
   WHERE f.id = new.fursuit_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Fursuit not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.conventions c
     WHERE c.id = new.convention_id
  )
  INTO v_convention_exists;

  IF NOT v_convention_exists THEN
    RAISE EXCEPTION 'Convention not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.profile_conventions pc
     WHERE pc.profile_id = v_owner_id
       AND pc.convention_id = new.convention_id
       AND pc.attendance_state = 'active'
       AND pc.active_until IS NULL
  ) THEN
    RAISE EXCEPTION 'Fursuit owner must join the convention before assigning this fursuit';
  END IF;

  IF NOT public.is_convention_prejoinable(new.convention_id) THEN
    IF tg_op = 'INSERT' THEN
      RETURN NULL;
    END IF;

    RAISE EXCEPTION 'Convention is not open for registration';
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_catch_with_event(
  p_fursuit_id uuid,
  p_catcher_id uuid,
  p_convention_id uuid DEFAULT NULL::uuid,
  p_is_tutorial boolean DEFAULT false,
  p_force_pending boolean DEFAULT false,
  p_catch_photo_source text DEFAULT NULL::text,
  p_catch_photo_path text DEFAULT NULL::text,
  p_catch_photo_url text DEFAULT NULL::text,
  p_client_attempt_id text DEFAULT NULL::text,
  p_photo_upload_state text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_owner_catch_mode text;
  v_fursuit_owner_id uuid;
  v_fursuit_name text;
  v_fursuit_avatar_path text;
  v_fursuit_avatar_url text;
  v_fursuit_species_id uuid;
  v_fursuit_species_name text;
  v_catch_status text;
  v_expires_at timestamptz;
  v_catch_id uuid;
  v_catch_number integer;
  v_event_type text;
  v_event_id uuid;
  v_event_duplicate boolean := false;
  v_event_enqueued boolean := false;
  v_result json;
  v_photo_source text := p_catch_photo_source;
  v_photo_upload_state text := p_photo_upload_state;
  v_is_gallery_catch boolean;
  v_defer_pending_event boolean;
  v_normalized_client_attempt_id text := NULLIF(btrim(p_client_attempt_id), '');
  v_constraint_name text;
  v_existing record;
BEGIN
  IF v_normalized_client_attempt_id IS NOT NULL THEN
    SELECT
      c.id,
      c.catch_number,
      c.status,
      c.expires_at,
      c.convention_id,
      c.catcher_id,
      c.fursuit_id,
      c.photo_upload_state,
      f.owner_id,
      f.name,
      f.avatar_path,
      f.avatar_url,
      f.species_id,
      fs.name AS species_name
    INTO v_existing
    FROM public.catches c
    JOIN public.fursuits f ON f.id = c.fursuit_id
    LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
    WHERE c.client_attempt_id = v_normalized_client_attempt_id
      AND c.catcher_id = p_catcher_id
    LIMIT 1;

    IF FOUND THEN
      IF v_existing.catcher_id <> p_catcher_id THEN
        RAISE EXCEPTION 'Client attempt id belongs to another catcher';
      END IF;

      RETURN json_build_object(
        'catch_id', v_existing.id,
        'status', v_existing.status,
        'expires_at', v_existing.expires_at,
        'catch_number', v_existing.catch_number,
        'requires_approval', v_existing.status = 'PENDING',
        'fursuit_owner_id', v_existing.owner_id,
        'convention_id', v_existing.convention_id,
        'fursuit_id', v_existing.fursuit_id,
        'fursuit_name', v_existing.name,
        'fursuit_avatar_path', v_existing.avatar_path,
        'fursuit_avatar_url', v_existing.avatar_url,
        'fursuit_species_id', v_existing.species_id,
        'fursuit_species_name', v_existing.species_name,
        'photo_upload_state', v_existing.photo_upload_state,
        'event_id', NULL,
        'event_duplicate', true,
        'event_enqueued', false
      );
    END IF;
  END IF;

  IF v_photo_source IS NULL AND p_catch_photo_url IS NOT NULL THEN
    v_photo_source := 'camera';
  END IF;

  IF v_photo_source IS NOT NULL AND v_photo_source NOT IN ('camera', 'gallery') THEN
    RAISE EXCEPTION 'Invalid catch photo source';
  END IF;

  IF p_catch_photo_path IS NOT NULL AND p_catch_photo_url IS NULL THEN
    RAISE EXCEPTION 'Missing catch photo url';
  END IF;

  IF v_photo_upload_state IS NULL THEN
    IF p_catch_photo_url IS NOT NULL THEN
      v_photo_upload_state := 'uploaded';
    ELSIF v_photo_source IS NOT NULL THEN
      v_photo_upload_state := 'pending_upload';
    ELSE
      v_photo_upload_state := 'not_required';
    END IF;
  END IF;

  IF v_photo_upload_state NOT IN ('not_required', 'pending_upload', 'uploaded', 'failed') THEN
    RAISE EXCEPTION 'Invalid photo upload state';
  END IF;

  IF v_photo_source IS NULL AND v_photo_upload_state <> 'not_required' THEN
    RAISE EXCEPTION 'Photo upload state requires a photo source';
  END IF;

  IF v_photo_source IS NOT NULL AND v_photo_upload_state = 'not_required' THEN
    RAISE EXCEPTION 'Photo catches require a photo upload state';
  END IF;

  IF v_photo_upload_state = 'uploaded' AND p_catch_photo_url IS NULL THEN
    RAISE EXCEPTION 'Uploaded photo catches require a photo url';
  END IF;

  IF p_catch_photo_url IS NOT NULL AND v_photo_upload_state <> 'uploaded' THEN
    RAISE EXCEPTION 'Attached photo url requires uploaded state';
  END IF;

  IF v_photo_upload_state = 'failed' THEN
    RAISE EXCEPTION 'New photo catches cannot start failed';
  END IF;

  v_is_gallery_catch := v_photo_source = 'gallery';

  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_catcher_id THEN
    RAISE EXCEPTION 'Catcher must match the authenticated user';
  END IF;

  SELECT
    COALESCE(p.default_catch_mode, 'AUTO_ACCEPT'),
    f.owner_id,
    f.name,
    f.avatar_path,
    f.avatar_url,
    f.species_id,
    fs.name
  INTO
    v_owner_catch_mode,
    v_fursuit_owner_id,
    v_fursuit_name,
    v_fursuit_avatar_path,
    v_fursuit_avatar_url,
    v_fursuit_species_id,
    v_fursuit_species_name
  FROM public.fursuits f
  LEFT JOIN public.profiles p ON p.id = f.owner_id
  LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
  WHERE f.id = p_fursuit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fursuit not found';
  END IF;

  IF v_fursuit_owner_id = p_catcher_id THEN
    RAISE EXCEPTION 'Cannot catch your own fursuit';
  END IF;

  IF v_is_gallery_catch AND p_convention_id IS NULL THEN
    RAISE EXCEPTION 'Gallery catches require a convention';
  END IF;

  IF p_convention_id IS NOT NULL THEN
    IF v_is_gallery_catch THEN
      IF NOT public.is_convention_gallery_catchable(p_convention_id) THEN
        RAISE EXCEPTION 'Convention is not accepting gallery catches';
      END IF;

      IF NOT public.is_profile_convention_gallery_catch_eligible(
        p_profile_id => p_catcher_id,
        p_convention_id => p_convention_id
      ) THEN
        RAISE EXCEPTION 'Catcher must have a playable convention before catching';
      END IF;

      IF NOT public.is_profile_convention_gallery_catch_eligible(
        p_profile_id => v_fursuit_owner_id,
        p_convention_id => p_convention_id
      ) THEN
        RAISE EXCEPTION 'Fursuit owner must have a playable convention before catching';
      END IF;
    ELSE
      IF NOT public.is_convention_joinable(p_convention_id) THEN
        RAISE EXCEPTION 'Convention is not live';
      END IF;

      IF NOT public.is_profile_convention_gameplay_eligible(p_catcher_id, p_convention_id) THEN
        RAISE EXCEPTION 'Catcher must join the live convention before catching';
      END IF;

      IF NOT public.is_profile_convention_gameplay_eligible(v_fursuit_owner_id, p_convention_id) THEN
        RAISE EXCEPTION 'Fursuit owner must join the live convention before catching';
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM public.fursuit_conventions fc
       WHERE fc.fursuit_id = p_fursuit_id
         AND fc.convention_id = p_convention_id
         AND fc.roster_state = 'active'
         AND fc.active_until IS NULL
    ) THEN
      RAISE EXCEPTION 'Fursuit must be assigned to the live convention before it can be caught there';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.catches
       WHERE fursuit_id = p_fursuit_id
         AND catcher_id = p_catcher_id
         AND convention_id = p_convention_id
         AND status IN ('ACCEPTED', 'PENDING')
    ) THEN
      RAISE EXCEPTION 'Fursuit already caught at this convention';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
        FROM public.catches
       WHERE fursuit_id = p_fursuit_id
         AND catcher_id = p_catcher_id
         AND convention_id IS NULL
         AND status IN ('ACCEPTED', 'PENDING')
    ) THEN
      RAISE EXCEPTION 'Fursuit already caught or pending';
    END IF;
  END IF;

  IF (v_owner_catch_mode = 'MANUAL_APPROVAL' OR p_force_pending OR v_is_gallery_catch) AND NOT p_is_tutorial THEN
    v_catch_status := 'PENDING';
    IF p_convention_id IS NOT NULL THEN
      v_expires_at := public.calculate_catch_expiration(p_convention_id);
    ELSE
      v_expires_at := public.calculate_catch_expiration();
    END IF;
  ELSE
    v_catch_status := 'ACCEPTED';
    v_expires_at := NULL;
  END IF;

  BEGIN
    INSERT INTO public.catches (
      fursuit_id,
      catcher_id,
      convention_id,
      is_tutorial,
      status,
      expires_at,
      caught_at,
      catch_photo_source,
      catch_photo_path,
      catch_photo_url,
      client_attempt_id,
      photo_upload_state
    )
    VALUES (
      p_fursuit_id,
      p_catcher_id,
      p_convention_id,
      p_is_tutorial,
      v_catch_status,
      v_expires_at,
      now(),
      v_photo_source,
      p_catch_photo_path,
      p_catch_photo_url,
      v_normalized_client_attempt_id,
      v_photo_upload_state
    )
    RETURNING id, catch_number INTO v_catch_id, v_catch_number;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = constraint_name;

      IF v_constraint_name = 'catches_catcher_client_attempt_id_idx' THEN
        RAISE EXCEPTION 'Client attempt id already used';
      END IF;

      RAISE;
  END;

  v_event_type := CASE WHEN v_catch_status = 'PENDING' THEN 'catch_pending' ELSE 'catch_performed' END;
  v_defer_pending_event := v_event_type = 'catch_pending'
    AND v_photo_source IS NOT NULL
    AND v_photo_upload_state = 'pending_upload';

  IF NOT v_defer_pending_event THEN
    SELECT event_id, duplicate, enqueued
      INTO v_event_id, v_event_duplicate, v_event_enqueued
    FROM app_private.ingest_gameplay_event(
      v_event_type,
      p_catcher_id,
      p_convention_id,
      jsonb_build_object(
        'catch_id', v_catch_id,
        'fursuit_id', p_fursuit_id,
        'catcher_id', p_catcher_id,
        'fursuit_owner_id', v_fursuit_owner_id,
        'convention_id', p_convention_id,
        'is_tutorial', p_is_tutorial,
        'status', v_catch_status,
        'catch_photo_source', v_photo_source,
        'photo_upload_state', v_photo_upload_state,
        'client_attempt_id', v_normalized_client_attempt_id
      ),
      now(),
      format('catch:%s:%s', v_catch_id, v_event_type)
    );
  END IF;

  SELECT json_build_object(
    'catch_id', v_catch_id,
    'status', v_catch_status,
    'expires_at', v_expires_at,
    'catch_number', v_catch_number,
    'requires_approval', v_catch_status = 'PENDING',
    'fursuit_owner_id', v_fursuit_owner_id,
    'convention_id', p_convention_id,
    'fursuit_id', p_fursuit_id,
    'fursuit_name', v_fursuit_name,
    'fursuit_avatar_path', v_fursuit_avatar_path,
    'fursuit_avatar_url', v_fursuit_avatar_url,
    'fursuit_species_id', v_fursuit_species_id,
    'fursuit_species_name', v_fursuit_species_name,
    'photo_upload_state', v_photo_upload_state,
    'event_id', v_event_id,
    'event_duplicate', COALESCE(v_event_duplicate, false),
    'event_enqueued', COALESCE(v_event_enqueued, false)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_convention_lifecycle_health_counts(
  p_convention_ids uuid[],
  p_local_days jsonb DEFAULT '{}'::jsonb,
  p_retry_window_start timestamp with time zone DEFAULT now() - interval '7 days',
  p_throttle_window_start timestamp with time zone DEFAULT now() - interval '6 hours'
)
RETURNS TABLE (
  convention_id uuid,
  convention_tasks_count integer,
  today_assignments_count integer,
  accepted_convention_catches_count integer,
  pending_convention_catches_count integer,
  active_profile_memberships_count integer,
  active_fursuit_assignments_count integer,
  participant_recaps_count integer,
  last_automation_attempt_at timestamp with time zone,
  last_automation_source text,
  automation_retry_attempts_last_7_days integer,
  recent_cron_close_attempt boolean,
  recent_cron_retry_attempt boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requested AS (
    SELECT DISTINCT unnest(COALESCE(p_convention_ids, ARRAY[]::uuid[])) AS convention_id
  ),
  convention_tasks AS (
    SELECT dt.convention_id, COUNT(*)::integer AS row_count
    FROM public.daily_tasks dt
    JOIN requested r ON r.convention_id = dt.convention_id
    WHERE dt.is_active = true
    GROUP BY dt.convention_id
  ),
  today_assignments AS (
    SELECT da.convention_id, COUNT(*)::integer AS row_count
    FROM public.daily_assignments da
    JOIN requested r ON r.convention_id = da.convention_id
    WHERE da.day = NULLIF(p_local_days ->> da.convention_id::text, '')::date
    GROUP BY da.convention_id
  ),
  accepted_catches AS (
    SELECT c.convention_id, COUNT(*)::integer AS row_count
    FROM public.catches c
    JOIN requested r ON r.convention_id = c.convention_id
    WHERE c.status = 'ACCEPTED'
      AND c.is_tutorial = false
    GROUP BY c.convention_id
  ),
  pending_catches AS (
    SELECT c.convention_id, COUNT(*)::integer AS row_count
    FROM public.catches c
    JOIN requested r ON r.convention_id = c.convention_id
    WHERE c.status = 'PENDING'
    GROUP BY c.convention_id
  ),
  profile_memberships AS (
    SELECT pc.convention_id, COUNT(*)::integer AS row_count
    FROM public.profile_conventions pc
    JOIN requested r ON r.convention_id = pc.convention_id
    WHERE pc.attendance_state = 'active'
      AND pc.active_until IS NULL
    GROUP BY pc.convention_id
  ),
  fursuit_assignments AS (
    SELECT fc.convention_id, COUNT(*)::integer AS row_count
    FROM public.fursuit_conventions fc
    JOIN requested r ON r.convention_id = fc.convention_id
    WHERE fc.roster_state = 'active'
      AND fc.active_until IS NULL
    GROUP BY fc.convention_id
  ),
  participant_recaps AS (
    SELECT cpr.convention_id, COUNT(*)::integer AS row_count
    FROM public.convention_participant_recaps cpr
    JOIN requested r ON r.convention_id = cpr.convention_id
    GROUP BY cpr.convention_id
  ),
  last_automation AS (
    SELECT DISTINCT ON (al.entity_id)
      al.entity_id AS convention_id,
      al.created_at,
      al.context ->> 'source' AS source
    FROM public.audit_log al
    JOIN requested r ON r.convention_id = al.entity_id
    WHERE al.entity_type = 'convention'
      AND al.action IN (
        'close_convention_attempt',
        'close_convention_noop',
        'regenerate_convention_recaps_attempt'
      )
      AND al.context ->> 'source' IN (
        'cron_close',
        'cron_retry',
        'admin_close',
        'admin_retry',
        'admin_regenerate'
      )
    ORDER BY al.entity_id, al.created_at DESC
  ),
  automation_counts AS (
    SELECT
      al.entity_id AS convention_id,
      COUNT(*) FILTER (
        WHERE al.action = 'close_convention_attempt'
          AND al.context ->> 'source' = 'cron_retry'
          AND al.created_at >= p_retry_window_start
      )::integer AS retry_attempts_last_7_days,
      COALESCE(
        BOOL_OR(al.created_at >= p_throttle_window_start) FILTER (
          WHERE al.action = 'close_convention_attempt'
            AND al.context ->> 'source' = 'cron_close'
        ),
        false
      ) AS recent_cron_close_attempt,
      COALESCE(
        BOOL_OR(al.created_at >= p_throttle_window_start) FILTER (
          WHERE al.action = 'close_convention_attempt'
            AND al.context ->> 'source' = 'cron_retry'
        ),
        false
      ) AS recent_cron_retry_attempt
    FROM public.audit_log al
    JOIN requested r ON r.convention_id = al.entity_id
    WHERE al.entity_type = 'convention'
      AND al.action IN ('close_convention_attempt', 'close_convention_noop')
      AND al.context ->> 'source' IN ('cron_close', 'cron_retry')
    GROUP BY al.entity_id
  )
  SELECT
    r.convention_id,
    COALESCE(ct.row_count, 0) AS convention_tasks_count,
    COALESCE(ta.row_count, 0) AS today_assignments_count,
    COALESCE(ac.row_count, 0) AS accepted_convention_catches_count,
    COALESCE(pc.row_count, 0) AS pending_convention_catches_count,
    COALESCE(pm.row_count, 0) AS active_profile_memberships_count,
    COALESCE(fa.row_count, 0) AS active_fursuit_assignments_count,
    COALESCE(pr.row_count, 0) AS participant_recaps_count,
    la.created_at AS last_automation_attempt_at,
    la.source AS last_automation_source,
    COALESCE(auc.retry_attempts_last_7_days, 0) AS automation_retry_attempts_last_7_days,
    COALESCE(auc.recent_cron_close_attempt, false) AS recent_cron_close_attempt,
    COALESCE(auc.recent_cron_retry_attempt, false) AS recent_cron_retry_attempt
  FROM requested r
  LEFT JOIN convention_tasks ct ON ct.convention_id = r.convention_id
  LEFT JOIN today_assignments ta ON ta.convention_id = r.convention_id
  LEFT JOIN accepted_catches ac ON ac.convention_id = r.convention_id
  LEFT JOIN pending_catches pc ON pc.convention_id = r.convention_id
  LEFT JOIN profile_memberships pm ON pm.convention_id = r.convention_id
  LEFT JOIN fursuit_assignments fa ON fa.convention_id = r.convention_id
  LEFT JOIN participant_recaps pr ON pr.convention_id = r.convention_id
  LEFT JOIN last_automation la ON la.convention_id = r.convention_id
  LEFT JOIN automation_counts auc ON auc.convention_id = r.convention_id;
$$;
