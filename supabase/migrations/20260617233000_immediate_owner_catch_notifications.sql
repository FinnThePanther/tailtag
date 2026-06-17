CREATE OR REPLACE FUNCTION app_private.insert_owner_catch_notification_once(
  p_catch_id uuid,
  p_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_catch record;
  v_type text := nullif(btrim(p_type), '');
  v_payload jsonb;
BEGIN
  IF p_catch_id IS NULL THEN
    RAISE EXCEPTION 'Missing catch id';
  END IF;

  IF v_type IS NULL OR v_type NOT IN ('catch_pending', 'fursuit_caught') THEN
    RAISE EXCEPTION 'Unsupported owner catch notification type';
  END IF;

  SELECT
    c.id,
    c.catcher_id,
    c.convention_id,
    c.fursuit_id,
    f.owner_id AS fursuit_owner_id,
    f.name AS fursuit_name,
    p.username AS catcher_username,
    public.can_view_fursuit_as_profile(f.owner_id, c.fursuit_id) AS can_owner_view_fursuit,
    public.can_view_profile_as_profile(f.owner_id, c.catcher_id) AS can_owner_view_catcher
  INTO v_catch
  FROM public.catches c
  JOIN public.fursuits f ON f.id = c.fursuit_id
  LEFT JOIN public.profiles p ON p.id = c.catcher_id
  WHERE c.id = p_catch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catch not found';
  END IF;

  IF v_type = 'catch_pending' THEN
    v_payload :=
      jsonb_build_object(
        'adult_boundary_checked', true,
        'catch_id', v_catch.id,
        'catcher_id', v_catch.catcher_id,
        'recipient_role', 'owner'
      )
      || CASE
        WHEN coalesce(v_catch.can_owner_view_fursuit, false)
          AND nullif(v_catch.fursuit_name, '') IS NOT NULL
          THEN jsonb_build_object('fursuit_name', v_catch.fursuit_name)
        ELSE '{}'::jsonb
      END
      || CASE
        WHEN coalesce(v_catch.can_owner_view_catcher, false)
          AND nullif(v_catch.catcher_username, '') IS NOT NULL
          THEN jsonb_build_object('catcher_username', v_catch.catcher_username)
        ELSE '{}'::jsonb
      END;
  ELSE
    v_payload :=
      jsonb_build_object(
        'adult_boundary_checked', true,
        'catch_id', v_catch.id,
        'catcher_id', v_catch.catcher_id,
        'fursuit_id', v_catch.fursuit_id,
        'recipient_role', 'owner',
        'convention_id', v_catch.convention_id
      )
      || CASE
        WHEN coalesce(v_catch.can_owner_view_fursuit, false)
          AND nullif(v_catch.fursuit_name, '') IS NOT NULL
          THEN jsonb_build_object('fursuit_name', v_catch.fursuit_name)
        ELSE '{}'::jsonb
      END
      || CASE
        WHEN coalesce(v_catch.can_owner_view_catcher, false)
          AND nullif(v_catch.catcher_username, '') IS NOT NULL
          THEN jsonb_build_object('catcher_username', v_catch.catcher_username)
        ELSE '{}'::jsonb
      END;
  END IF;

  PERFORM public.insert_catch_notification_once(
    v_catch.fursuit_owner_id,
    v_type,
    v_payload
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.insert_owner_catch_notification_once(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.insert_owner_catch_notification_once(uuid, text)
  TO service_role;

COMMENT ON FUNCTION app_private.insert_owner_catch_notification_once(uuid, text) IS
  'Creates owner-facing catch notifications synchronously while preserving catch notification dedupe.';

CREATE OR REPLACE FUNCTION public.create_catch_with_event(
  p_fursuit_id uuid,
  p_catcher_id uuid,
  p_convention_id uuid DEFAULT NULL::uuid,
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
SET search_path TO 'public', 'pg_temp'
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
  v_normalized_client_attempt_id text := nullif(btrim(p_client_attempt_id), '');
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
    coalesce(p.default_catch_mode, 'AUTO_ACCEPT'),
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

  IF NOT public.can_catch_fursuit_as_profile(p_catcher_id, p_fursuit_id) THEN
    RAISE EXCEPTION 'Adult boundary restricted catch'
      USING errcode = '42501';
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

  IF v_owner_catch_mode = 'MANUAL_APPROVAL' OR p_force_pending OR v_is_gallery_catch THEN
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
        'status', v_catch_status,
        'catch_photo_source', v_photo_source,
        'photo_upload_state', v_photo_upload_state,
        'client_attempt_id', v_normalized_client_attempt_id
      ),
      now(),
      format('catch:%s:%s', v_catch_id, v_event_type)
    );

    PERFORM app_private.insert_owner_catch_notification_once(
      v_catch_id,
      CASE WHEN v_event_type = 'catch_pending' THEN 'catch_pending' ELSE 'fursuit_caught' END
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
    'event_duplicate', coalesce(v_event_duplicate, false),
    'event_enqueued', coalesce(v_event_enqueued, false)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_catch_with_event(
  uuid,
  uuid,
  uuid,
  boolean,
  text,
  text,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_catch_with_event(
  uuid,
  uuid,
  uuid,
  boolean,
  text,
  text,
  text,
  text,
  text
) TO service_role;

CREATE OR REPLACE FUNCTION public.attach_catch_photo_after_upload(
  p_catch_id uuid,
  p_catcher_id uuid,
  p_catch_photo_path text,
  p_catch_photo_url text,
  p_catch_photo_source text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_catch record;
  v_photo_source text := p_catch_photo_source;
  v_event_id uuid;
  v_event_duplicate boolean := false;
  v_event_enqueued boolean := false;
BEGIN
  IF p_catch_photo_path IS NULL OR btrim(p_catch_photo_path) = '' THEN
    RAISE EXCEPTION 'Missing catch photo path';
  END IF;

  IF p_catch_photo_url IS NULL OR btrim(p_catch_photo_url) = '' THEN
    RAISE EXCEPTION 'Missing catch photo url';
  END IF;

  IF v_photo_source IS NOT NULL AND v_photo_source NOT IN ('camera', 'gallery') THEN
    RAISE EXCEPTION 'Invalid catch photo source';
  END IF;

  SELECT
    c.id,
    c.catcher_id,
    c.convention_id,
    c.fursuit_id,
    c.status,
    c.catch_photo_path,
    c.catch_photo_source,
    c.photo_upload_state,
    f.owner_id AS fursuit_owner_id
  INTO v_catch
  FROM public.catches c
  JOIN public.fursuits f ON f.id = c.fursuit_id
  WHERE c.id = p_catch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catch not found';
  END IF;

  IF v_catch.catcher_id <> p_catcher_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_catch.photo_upload_state = 'uploaded' THEN
    RETURN json_build_object(
      'success', true,
      'photo_upload_state', 'uploaded',
      'event_id', NULL,
      'event_duplicate', true,
      'event_enqueued', false
    );
  ELSIF v_catch.photo_upload_state NOT IN ('pending_upload', 'failed') THEN
    RAISE EXCEPTION 'Catch photo upload is not pending';
  END IF;

  IF v_photo_source IS NULL THEN
    v_photo_source := coalesce(v_catch.catch_photo_source, 'camera');
  END IF;

  IF v_catch.photo_upload_state <> 'uploaded' THEN
    UPDATE public.catches
       SET catch_photo_path = p_catch_photo_path,
           catch_photo_url = p_catch_photo_url,
           catch_photo_source = v_photo_source,
           photo_upload_state = 'uploaded'
     WHERE id = p_catch_id;
  END IF;

  IF v_catch.status = 'PENDING' THEN
    SELECT event_id, duplicate, enqueued
      INTO v_event_id, v_event_duplicate, v_event_enqueued
    FROM app_private.ingest_gameplay_event(
      'catch_pending',
      v_catch.catcher_id,
      v_catch.convention_id,
      jsonb_build_object(
        'catch_id', v_catch.id,
        'fursuit_id', v_catch.fursuit_id,
        'catcher_id', v_catch.catcher_id,
        'fursuit_owner_id', v_catch.fursuit_owner_id,
        'convention_id', v_catch.convention_id,
        'status', v_catch.status,
        'catch_photo_source', v_photo_source,
        'photo_upload_state', 'uploaded'
      ),
      now(),
      format('catch:%s:%s', v_catch.id, 'catch_pending')
    );

    PERFORM app_private.insert_owner_catch_notification_once(
      v_catch.id,
      'catch_pending'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'photo_upload_state', 'uploaded',
    'event_id', v_event_id,
    'event_duplicate', coalesce(v_event_duplicate, false),
    'event_enqueued', coalesce(v_event_enqueued, false)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.attach_catch_photo_after_upload(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_catch_photo_after_upload(uuid, uuid, text, text, text)
  TO service_role;
