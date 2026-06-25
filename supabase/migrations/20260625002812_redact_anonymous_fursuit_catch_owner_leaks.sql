CREATE OR REPLACE FUNCTION app_private.visible_fursuit_owner_id(
  p_viewer_id uuid,
  p_fursuit_id uuid,
  p_owner_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.fursuits f
      WHERE f.id = p_fursuit_id
        AND f.owner_id = p_owner_id
        AND (
          p_viewer_id = f.owner_id
          OR EXISTS (
            SELECT 1
            FROM public.profiles viewer_profile
            WHERE viewer_profile.id = p_viewer_id
              AND viewer_profile.role IN ('owner', 'moderator')
          )
          OR f.owner_attribution_visibility = 'public'
        )
    )
      THEN p_owner_id
    ELSE NULL::uuid
  END;
$function$;

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
AS $function$
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
      RETURN json_build_object(
        'catch_id', v_existing.id,
        'status', v_existing.status,
        'expires_at', v_existing.expires_at,
        'catch_number', v_existing.catch_number,
        'requires_approval', v_existing.status = 'PENDING',
        'fursuit_owner_id',
          app_private.visible_fursuit_owner_id(
            p_catcher_id,
            v_existing.fursuit_id,
            v_existing.owner_id
          ),
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
    'fursuit_owner_id',
      app_private.visible_fursuit_owner_id(p_catcher_id, p_fursuit_id, v_fursuit_owner_id),
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
$function$;

CREATE OR REPLACE FUNCTION public.read_catch_invite_payload(p_invite public.catch_invites)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'invite_id', p_invite.id,
    'status', p_invite.status,
    'inviter_profile_id', p_invite.inviter_profile_id,
    'claimed_by_profile_id', NULL,
    'selected_fursuit_id', p_invite.selected_fursuit_id,
    'convention_id', p_invite.convention_id,
    'convention_name', conv.name,
    'invitee_display_name', p_invite.invitee_display_name,
    'catch_photo_path', p_invite.catch_photo_path,
    'catch_photo_url', p_invite.catch_photo_url,
    'catch_photo_source', p_invite.catch_photo_source,
    'caught_at', p_invite.caught_at,
    'expires_at', p_invite.expires_at,
    'credit_scope', p_invite.credit_scope,
    'converted_catch_id', p_invite.converted_catch_id,
    'inviter_username', inviter.username,
    'selected_fursuit_name', f.name,
    'selected_fursuit_avatar_url', f.avatar_url,
    'selected_fursuit_avatar_path', f.avatar_path
  )
  FROM public.profiles inviter
  LEFT JOIN public.conventions conv ON conv.id = p_invite.convention_id
  LEFT JOIN public.fursuits f ON f.id = p_invite.selected_fursuit_id
  WHERE inviter.id = p_invite.inviter_profile_id;
$function$;

CREATE OR REPLACE FUNCTION public.claim_catch_invite(
  p_token_hash text,
  p_claimant_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite public.catch_invites;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'claim_catch_invite requires service role';
  END IF;

  SELECT *
    INTO v_invite
  FROM public.catch_invites
  WHERE token_hash = btrim(p_token_hash)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.status IN ('PENDING', 'CLAIMED') AND v_invite.expires_at <= now() THEN
    UPDATE public.catch_invites
       SET status = 'EXPIRED'
     WHERE id = v_invite.id
     RETURNING * INTO v_invite;
  END IF;

  IF v_invite.status NOT IN ('PENDING', 'CLAIMED') THEN
    RETURN public.read_catch_invite_payload(v_invite);
  END IF;

  IF v_invite.inviter_profile_id = p_claimant_profile_id THEN
    RAISE EXCEPTION 'You cannot claim your own invite';
  END IF;

  IF v_invite.status = 'PENDING' THEN
    UPDATE public.catch_invites
       SET status = 'CLAIMED',
           claimed_by_profile_id = p_claimant_profile_id,
           claimed_at = now()
     WHERE id = v_invite.id
     RETURNING * INTO v_invite;

    INSERT INTO public.notifications (user_id, type, payload)
    VALUES (
      v_invite.inviter_profile_id,
      'catch_invite_claimed',
      jsonb_build_object(
        'catch_invite_id', v_invite.id,
        'convention_id', v_invite.convention_id
      )
    );
  ELSIF v_invite.claimed_by_profile_id IS DISTINCT FROM p_claimant_profile_id THEN
    RAISE EXCEPTION 'Invite has already been claimed';
  END IF;

  RETURN public.read_catch_invite_payload(v_invite);
END;
$function$;

CREATE OR REPLACE FUNCTION public.decline_catch_invite(
  p_invite_id uuid,
  p_claimant_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite public.catch_invites;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'decline_catch_invite requires service role';
  END IF;

  UPDATE public.catch_invites
     SET status = 'DECLINED',
         declined_at = now()
   WHERE id = p_invite_id
     AND status = 'CLAIMED'
     AND claimed_by_profile_id = p_claimant_profile_id
   RETURNING * INTO v_invite;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite is not claimable by this user';
  END IF;

  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (
    v_invite.inviter_profile_id,
    'catch_invite_declined',
    jsonb_build_object(
      'catch_invite_id', v_invite.id,
      'convention_id', v_invite.convention_id
    )
  );

  RETURN public.read_catch_invite_payload(v_invite);
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_catch_invite(
  p_invite_id uuid,
  p_claimant_profile_id uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite public.catch_invites;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'report_catch_invite requires service role';
  END IF;

  UPDATE public.catch_invites
     SET status = 'REPORTED',
         reported_at = now(),
         report_reason = nullif(btrim(p_reason), '')
   WHERE id = p_invite_id
     AND status = 'CLAIMED'
     AND claimed_by_profile_id = p_claimant_profile_id
   RETURNING * INTO v_invite;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite is not reportable by this user';
  END IF;

  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (
    v_invite.inviter_profile_id,
    'catch_invite_reported',
    jsonb_build_object(
      'catch_invite_id', v_invite.id,
      'convention_id', v_invite.convention_id
    )
  );

  RETURN public.read_catch_invite_payload(v_invite);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_catch_reciprocal_offer(
  p_primary_catch_id uuid,
  p_offered_fursuit_id uuid,
  p_offered_by_profile_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_validation record;
  v_primary_status text;
  v_primary_fursuit_id uuid;
  v_offer_id uuid;
  v_existing_offer record;
  v_process_result json;
BEGIN
  SELECT
    o.*,
    c.fursuit_id AS primary_fursuit_id
    INTO v_existing_offer
  FROM public.catch_reciprocal_offers o
  JOIN public.catches c ON c.id = o.primary_catch_id
  WHERE o.primary_catch_id = p_primary_catch_id
  LIMIT 1;

  IF FOUND AND v_existing_offer.status NOT IN ('FAILED', 'CANCELED') THEN
    RETURN json_build_object(
      'offer_id', v_existing_offer.id,
      'status', v_existing_offer.status,
      'reciprocal_catch_id', v_existing_offer.reciprocal_catch_id,
      'failure_reason', v_existing_offer.failure_reason,
      'event_enqueued', false,
      'offered_fursuit_id', v_existing_offer.offered_fursuit_id,
      'recipient_profile_id',
        app_private.visible_fursuit_owner_id(
          p_offered_by_profile_id,
          v_existing_offer.primary_fursuit_id,
          v_existing_offer.recipient_profile_id
        )
    );
  END IF;

  SELECT *
    INTO v_validation
  FROM public.validate_catch_reciprocal_offer(
    p_primary_catch_id,
    p_offered_by_profile_id,
    p_offered_fursuit_id
  )
  LIMIT 1;

  SELECT fursuit_id
    INTO v_primary_fursuit_id
  FROM public.catches
  WHERE id = p_primary_catch_id;

  INSERT INTO public.catch_reciprocal_offers (
    primary_catch_id,
    offered_fursuit_id,
    offered_by_profile_id,
    recipient_profile_id,
    convention_id
  )
  VALUES (
    p_primary_catch_id,
    p_offered_fursuit_id,
    p_offered_by_profile_id,
    v_validation.recipient_profile_id,
    v_validation.convention_id
  )
  ON CONFLICT (primary_catch_id) DO UPDATE
    SET offered_fursuit_id = EXCLUDED.offered_fursuit_id,
        offered_by_profile_id = EXCLUDED.offered_by_profile_id,
        recipient_profile_id = EXCLUDED.recipient_profile_id,
        convention_id = EXCLUDED.convention_id,
        status = CASE
          WHEN catch_reciprocal_offers.status IN ('PENDING', 'FAILED', 'CANCELED') THEN 'PENDING'
          ELSE catch_reciprocal_offers.status
        END,
        reciprocal_catch_id = CASE
          WHEN catch_reciprocal_offers.status IN ('FAILED', 'CANCELED') THEN NULL
          ELSE catch_reciprocal_offers.reciprocal_catch_id
        END,
        failure_reason = CASE
          WHEN catch_reciprocal_offers.status IN ('FAILED', 'CANCELED') THEN NULL
          ELSE catch_reciprocal_offers.failure_reason
        END,
        processed_at = CASE
          WHEN catch_reciprocal_offers.status IN ('FAILED', 'CANCELED') THEN NULL
          ELSE catch_reciprocal_offers.processed_at
        END,
        updated_at = now()
  RETURNING id INTO v_offer_id;

  SELECT status INTO v_primary_status
  FROM public.catches
  WHERE id = p_primary_catch_id;

  IF v_primary_status = 'ACCEPTED' THEN
    v_process_result := public.process_catch_reciprocal_offer(v_offer_id);
  ELSE
    v_process_result := json_build_object(
      'offer_id', v_offer_id,
      'status', 'PENDING',
      'event_enqueued', false
    );
  END IF;

  RETURN json_build_object(
    'offer_id', v_offer_id,
    'status', COALESCE(v_process_result ->> 'status', 'PENDING'),
    'reciprocal_catch_id', v_process_result ->> 'reciprocal_catch_id',
    'failure_reason', v_process_result ->> 'failure_reason',
    'event_enqueued', COALESCE((v_process_result ->> 'event_enqueued')::boolean, false),
    'offered_fursuit_id', p_offered_fursuit_id,
    'offered_fursuit_name', v_validation.offered_fursuit_name,
    'offered_fursuit_avatar_path', v_validation.offered_fursuit_avatar_path,
    'offered_fursuit_avatar_url', v_validation.offered_fursuit_avatar_url,
    'recipient_profile_id',
      app_private.visible_fursuit_owner_id(
        p_offered_by_profile_id,
        v_primary_fursuit_id,
        v_validation.recipient_profile_id
      )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_convention_suit_leaderboard(p_convention_id uuid)
RETURNS TABLE(
  fursuit_id uuid,
  convention_id uuid,
  fursuit_name text,
  fursuit_avatar_url text,
  owner_id uuid,
  species_id uuid,
  species_name text,
  color_assignments jsonb,
  catch_count bigint,
  unique_catchers bigint,
  last_caught_at timestamp with time zone,
  first_caught_at timestamp with time zone,
  fursuit_redacted boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH auth_context AS (
    SELECT auth.uid() AS id
  ),
  leaderboard AS (
    SELECT
      c.fursuit_id,
      c.convention_id,
      count(*) AS catch_count,
      count(distinct c.catcher_id) AS unique_catchers,
      max(c.caught_at) AS last_caught_at,
      min(c.caught_at) AS first_caught_at
    FROM public.catches c
    CROSS JOIN auth_context cu
    WHERE cu.id IS NOT NULL
      AND c.status = 'ACCEPTED'
      AND c.catch_credit_scope = 'full'
      AND c.convention_id = p_convention_id
    GROUP BY c.fursuit_id, c.convention_id
  )
  SELECT
    l.fursuit_id,
    l.convention_id,
    CASE WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN f.name ELSE NULL END AS fursuit_name,
    CASE WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN f.avatar_url ELSE NULL END AS fursuit_avatar_url,
    CASE
      WHEN public.can_view_fursuit(cu.id, l.fursuit_id)
       AND public.can_view_fursuit_owner(cu.id, l.fursuit_id)
        THEN f.owner_id
      ELSE NULL
    END AS owner_id,
    CASE WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN fs.id ELSE NULL END AS species_id,
    CASE WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN fs.name ELSE NULL END AS species_name,
    CASE WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN colors.color_assignments ELSE '[]'::jsonb END AS color_assignments,
    l.catch_count,
    l.unique_catchers,
    l.last_caught_at,
    l.first_caught_at,
    NOT public.can_view_fursuit(cu.id, l.fursuit_id) AS fursuit_redacted
  FROM leaderboard l
  JOIN public.fursuits f ON f.id = l.fursuit_id
  LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
  CROSS JOIN auth_context cu
  LEFT JOIN LATERAL (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'position', fca.position,
          'color', jsonb_build_object('id', fc.id, 'name', fc.name, 'normalized_name', fc.normalized_name)
        )
        ORDER BY fca.position ASC, fc.name ASC
      ),
      '[]'::jsonb
    ) AS color_assignments
    FROM public.fursuit_color_assignments fca
    JOIN public.fursuit_colors fc ON fc.id = fca.color_id
    WHERE fca.fursuit_id = f.id
  ) colors ON true
  WHERE NOT public.is_blocked(cu.id, f.owner_id)
  ORDER BY l.catch_count DESC, fursuit_name ASC NULLS LAST, l.fursuit_id ASC;
$function$;

DROP POLICY IF EXISTS "events_select" ON public.events;
REVOKE SELECT ON TABLE public.events FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_convention_suit_leaderboard(uuid) TO authenticated;
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
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_catch_reciprocal_offer(uuid, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
