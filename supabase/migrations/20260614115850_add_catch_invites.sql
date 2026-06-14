-- TAILTAG-81: Invite catches for fursuits that are not on TailTag yet.

ALTER TABLE public.catches
  ADD COLUMN IF NOT EXISTS catch_credit_scope text NOT NULL DEFAULT 'full';

ALTER TABLE public.catches
  DROP CONSTRAINT IF EXISTS catches_catch_credit_scope_check;

ALTER TABLE public.catches
  ADD CONSTRAINT catches_catch_credit_scope_check
  CHECK (catch_credit_scope IN ('full', 'personal_only'));

ALTER TABLE public.profile_conventions
  DROP CONSTRAINT IF EXISTS valid_verification_method;

ALTER TABLE public.profile_conventions
  ADD CONSTRAINT valid_verification_method
  CHECK (
    verification_method = ANY (
      ARRAY[
        'none'::text,
        'gps'::text,
        'manual_override'::text,
        'grandfathered'::text,
        'invite_claim'::text
      ]
    )
  );

CREATE TABLE IF NOT EXISTS public.catch_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  claimed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  selected_fursuit_id uuid REFERENCES public.fursuits(id) ON DELETE SET NULL,
  convention_id uuid REFERENCES public.conventions(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING',
  credit_scope text NOT NULL DEFAULT 'full',
  invitee_display_name text,
  catch_photo_path text NOT NULL,
  catch_photo_url text NOT NULL,
  catch_photo_source text NOT NULL DEFAULT 'camera',
  caught_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  claimed_at timestamp with time zone,
  approved_at timestamp with time zone,
  declined_at timestamp with time zone,
  reported_at timestamp with time zone,
  canceled_at timestamp with time zone,
  report_reason text,
  converted_catch_id uuid REFERENCES public.catches(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT catch_invites_status_check
    CHECK (status IN (
      'PENDING',
      'CLAIMED',
      'APPROVED',
      'DECLINED',
      'EXPIRED',
      'REPORTED',
      'CANCELED',
      'CANCELED_DUPLICATE'
    )),
  CONSTRAINT catch_invites_credit_scope_check
    CHECK (credit_scope IN ('full', 'personal_only')),
  CONSTRAINT catch_invites_photo_source_check
    CHECK (catch_photo_source IN ('camera', 'gallery')),
  CONSTRAINT catch_invites_not_self_claimed_check
    CHECK (claimed_by_profile_id IS NULL OR claimed_by_profile_id <> inviter_profile_id)
);

CREATE INDEX IF NOT EXISTS catch_invites_inviter_profile_id_idx
  ON public.catch_invites (inviter_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS catch_invites_claimed_by_profile_id_idx
  ON public.catch_invites (claimed_by_profile_id, updated_at DESC)
  WHERE claimed_by_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS catch_invites_status_expires_at_idx
  ON public.catch_invites (status, expires_at);

CREATE INDEX IF NOT EXISTS catch_invites_convention_id_idx
  ON public.catch_invites (convention_id)
  WHERE convention_id IS NOT NULL;

ALTER TABLE public.catch_invites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.catch_invites FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.catch_invites TO service_role;

CREATE OR REPLACE FUNCTION public.touch_catch_invite_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS catch_invites_touch_updated_at ON public.catch_invites;
CREATE TRIGGER catch_invites_touch_updated_at
BEFORE UPDATE ON public.catch_invites
FOR EACH ROW EXECUTE FUNCTION public.touch_catch_invite_updated_at();

CREATE OR REPLACE FUNCTION public.catch_invite_expiration(p_convention_id uuid)
RETURNS timestamp with time zone
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_timezone text;
  v_end_date date;
BEGIN
  IF p_convention_id IS NULL THEN
    RETURN now() + interval '14 days';
  END IF;

  SELECT coalesce(nullif(timezone, ''), 'UTC'), end_date
    INTO v_timezone, v_end_date
  FROM public.conventions
  WHERE id = p_convention_id;

  IF v_end_date IS NULL THEN
    RETURN now() + interval '14 days';
  END IF;

  RETURN ((v_end_date + interval '15 days' - interval '1 second') AT TIME ZONE v_timezone);
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_convention_closeout_started(p_convention_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce((
    SELECT c.status IN ('finalizing', 'closeout_running', 'closeout_failed', 'closed', 'archived', 'canceled')
      OR c.finalizing_started_at IS NOT NULL
      OR c.closed_at IS NOT NULL
      OR c.archived_at IS NOT NULL
    FROM public.conventions c
    WHERE c.id = p_convention_id
  ), false);
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
    'claimed_by_profile_id', p_invite.claimed_by_profile_id,
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

CREATE OR REPLACE FUNCTION public.create_catch_invite(
  p_inviter_profile_id uuid,
  p_token_hash text,
  p_catch_photo_path text,
  p_catch_photo_url text,
  p_catch_photo_source text DEFAULT 'camera',
  p_convention_id uuid DEFAULT NULL::uuid,
  p_invitee_display_name text DEFAULT NULL::text,
  p_caught_at timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite public.catch_invites;
  v_daily_count integer;
  v_active_count integer;
  v_expires_at timestamptz;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'create_catch_invite requires service role';
  END IF;

  IF p_token_hash IS NULL OR btrim(p_token_hash) = '' THEN
    RAISE EXCEPTION 'Missing invite token';
  END IF;

  IF p_catch_photo_path IS NULL OR btrim(p_catch_photo_path) = '' THEN
    RAISE EXCEPTION 'Missing invite photo path';
  END IF;

  IF p_catch_photo_url IS NULL OR btrim(p_catch_photo_url) = '' THEN
    RAISE EXCEPTION 'Missing invite photo url';
  END IF;

  IF p_catch_photo_source NOT IN ('camera', 'gallery') THEN
    RAISE EXCEPTION 'Invalid invite photo source';
  END IF;

  SELECT count(*)::integer INTO v_daily_count
  FROM public.catch_invites
  WHERE inviter_profile_id = p_inviter_profile_id
    AND created_at >= now() - interval '24 hours';

  IF v_daily_count >= 20 THEN
    RAISE EXCEPTION 'Invite limit reached';
  END IF;

  SELECT count(*)::integer INTO v_active_count
  FROM public.catch_invites
  WHERE inviter_profile_id = p_inviter_profile_id
    AND status IN ('PENDING', 'CLAIMED');

  IF v_active_count >= 50 THEN
    RAISE EXCEPTION 'Too many active invites';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_inviter_profile_id
      AND (p.is_suspended OR (p.suspended_until IS NOT NULL AND p.suspended_until > now()))
  ) THEN
    RAISE EXCEPTION 'Suspended users cannot create invites';
  END IF;

  v_expires_at := public.catch_invite_expiration(p_convention_id);

  INSERT INTO public.catch_invites (
    inviter_profile_id,
    token_hash,
    convention_id,
    invitee_display_name,
    catch_photo_path,
    catch_photo_url,
    catch_photo_source,
    caught_at,
    expires_at
  )
  VALUES (
    p_inviter_profile_id,
    btrim(p_token_hash),
    p_convention_id,
    nullif(btrim(p_invitee_display_name), ''),
    btrim(p_catch_photo_path),
    btrim(p_catch_photo_url),
    p_catch_photo_source,
    coalesce(p_caught_at, now()),
    v_expires_at
  )
  RETURNING * INTO v_invite;

  RETURN public.read_catch_invite_payload(v_invite);
END;
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
        'claimant_profile_id', p_claimant_profile_id,
        'convention_id', v_invite.convention_id
      )
    );
  ELSIF v_invite.claimed_by_profile_id IS DISTINCT FROM p_claimant_profile_id THEN
    RAISE EXCEPTION 'Invite has already been claimed';
  END IF;

  RETURN public.read_catch_invite_payload(v_invite);
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_catch_invite(
  p_invite_id uuid,
  p_claimant_profile_id uuid,
  p_fursuit_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite public.catch_invites;
  v_fursuit public.fursuits;
  v_credit_scope text := 'full';
  v_catch_id uuid;
  v_catch_number integer;
  v_event_id uuid := NULL;
  v_event_duplicate boolean := false;
  v_event_enqueued boolean := false;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'approve_catch_invite requires service role';
  END IF;

  SELECT *
    INTO v_invite
  FROM public.catch_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.status IN ('PENDING', 'CLAIMED') AND v_invite.expires_at <= now() THEN
    UPDATE public.catch_invites
       SET status = 'EXPIRED'
     WHERE id = v_invite.id;
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  IF v_invite.status = 'REPORTED' THEN
    RAISE EXCEPTION 'Invite is under review';
  END IF;

  IF v_invite.status <> 'CLAIMED'
     OR v_invite.claimed_by_profile_id IS DISTINCT FROM p_claimant_profile_id THEN
    RAISE EXCEPTION 'Invite is not claimable by this user';
  END IF;

  SELECT *
    INTO v_fursuit
  FROM public.fursuits
  WHERE id = p_fursuit_id
    AND owner_id = p_claimant_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected fursuit not found';
  END IF;

  IF coalesce(v_fursuit.is_flagged, false) THEN
    RAISE EXCEPTION 'Selected fursuit cannot be used for this invite';
  END IF;

  IF public.is_blocked(v_invite.inviter_profile_id, p_claimant_profile_id) THEN
    RAISE EXCEPTION 'Cannot approve this invite';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catches c
    WHERE c.catcher_id = v_invite.inviter_profile_id
      AND c.fursuit_id = p_fursuit_id
      AND c.status IN ('ACCEPTED', 'PENDING')
      AND (
        (v_invite.convention_id IS NULL AND c.convention_id IS NULL)
        OR c.convention_id = v_invite.convention_id
      )
  ) THEN
    UPDATE public.catch_invites
       SET status = 'CANCELED_DUPLICATE',
           selected_fursuit_id = p_fursuit_id,
           canceled_at = now()
     WHERE id = v_invite.id
     RETURNING * INTO v_invite;

    RETURN public.read_catch_invite_payload(v_invite);
  END IF;

  IF v_invite.convention_id IS NOT NULL THEN
    v_credit_scope := CASE
      WHEN public.is_convention_closeout_started(v_invite.convention_id) THEN 'personal_only'
      ELSE 'full'
    END;

    INSERT INTO public.profile_conventions (
      profile_id,
      convention_id,
      attendance_state,
      verification_method,
      verified_at,
      override_reason
    )
    VALUES (
      p_claimant_profile_id,
      v_invite.convention_id,
      'active',
      'invite_claim',
      now(),
      'TailTag invite catch claim'
    )
    ON CONFLICT (profile_id, convention_id) DO UPDATE
      SET attendance_state = CASE
            WHEN profile_conventions.attendance_state IN ('removed', 'finalized')
              THEN profile_conventions.attendance_state
            ELSE 'active'
          END,
          active_until = CASE
            WHEN profile_conventions.attendance_state IN ('removed', 'finalized')
              THEN profile_conventions.active_until
            ELSE NULL
          END,
          verification_method = coalesce(profile_conventions.verification_method, 'invite_claim'),
          verified_at = coalesce(profile_conventions.verified_at, now());

    INSERT INTO public.fursuit_conventions (
      fursuit_id,
      convention_id,
      roster_visible,
      roster_state,
      active_until
    )
    VALUES (
      p_fursuit_id,
      v_invite.convention_id,
      true,
      'active',
      NULL
    )
    ON CONFLICT (fursuit_id, convention_id) DO UPDATE
      SET roster_visible = true,
          roster_state = CASE
            WHEN fursuit_conventions.roster_state = 'finalized' THEN 'finalized'
            ELSE 'active'
          END,
          active_until = CASE
            WHEN fursuit_conventions.roster_state = 'finalized' THEN fursuit_conventions.active_until
            ELSE NULL
          END;
  END IF;

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
    photo_upload_state,
    catch_credit_scope
  )
  VALUES (
    p_fursuit_id,
    v_invite.inviter_profile_id,
    v_invite.convention_id,
    'ACCEPTED',
    NULL,
    v_invite.caught_at,
    v_invite.catch_photo_source,
    v_invite.catch_photo_path,
    v_invite.catch_photo_url,
    format('invite:%s', v_invite.id),
    'uploaded',
    v_credit_scope
  )
  RETURNING id, catch_number INTO v_catch_id, v_catch_number;

  IF v_credit_scope = 'full' THEN
    SELECT event_id, duplicate, enqueued
      INTO v_event_id, v_event_duplicate, v_event_enqueued
    FROM app_private.ingest_gameplay_event(
      'catch_performed',
      v_invite.inviter_profile_id,
      v_invite.convention_id,
      jsonb_build_object(
        'catch_id', v_catch_id,
        'fursuit_id', p_fursuit_id,
        'catcher_id', v_invite.inviter_profile_id,
        'fursuit_owner_id', p_claimant_profile_id,
        'convention_id', v_invite.convention_id,
        'status', 'ACCEPTED',
        'source', 'catch_invite',
        'catch_invite_id', v_invite.id,
        'catch_credit_scope', v_credit_scope,
        'client_attempt_id', format('invite:%s', v_invite.id)
      ),
      v_invite.caught_at,
      format('catch:%s:%s', v_catch_id, 'catch_performed')
    );
  END IF;

  UPDATE public.catch_invites
     SET status = 'APPROVED',
         selected_fursuit_id = p_fursuit_id,
         credit_scope = v_credit_scope,
         converted_catch_id = v_catch_id,
         approved_at = now()
   WHERE id = v_invite.id
   RETURNING * INTO v_invite;

  PERFORM public.insert_catch_notification_once(
    v_invite.inviter_profile_id,
    'catch_invite_approved',
    jsonb_build_object(
      'catch_invite_id', v_invite.id,
      'catch_id', v_catch_id,
      'fursuit_id', p_fursuit_id,
      'fursuit_name', v_fursuit.name,
      'convention_id', v_invite.convention_id,
      'credit_scope', v_credit_scope
    )
  );

  RETURN public.read_catch_invite_payload(v_invite)
    || jsonb_build_object(
      'catch_id', v_catch_id,
      'catch_number', v_catch_number,
      'event_id', v_event_id,
      'event_duplicate', coalesce(v_event_duplicate, false),
      'event_enqueued', coalesce(v_event_enqueued, false)
    );
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
      'claimant_profile_id', p_claimant_profile_id,
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
      'claimant_profile_id', p_claimant_profile_id,
      'convention_id', v_invite.convention_id
    )
  );

  RETURN public.read_catch_invite_payload(v_invite);
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_stale_catch_invites()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'expire_stale_catch_invites requires service role';
  END IF;

  UPDATE public.catch_invites
     SET status = 'EXPIRED'
   WHERE status IN ('PENDING', 'CLAIMED')
     AND expires_at <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('expired_count', v_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_view_catch_photo_object(
  p_viewer_id uuid,
  p_object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.catches c
    WHERE (
        c.catch_photo_path = p_object_name
        OR right(coalesce(c.catch_photo_url, ''), length('/catch-photos/' || p_object_name)) =
          '/catch-photos/' || p_object_name
      )
      AND public.can_view_fursuit(p_viewer_id, c.fursuit_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.catch_invites ci
    WHERE (
        ci.catch_photo_path = p_object_name
        OR right(coalesce(ci.catch_photo_url, ''), length('/catch-photos/' || p_object_name)) =
          '/catch-photos/' || p_object_name
      )
      AND (
        ci.inviter_profile_id = p_viewer_id
        OR ci.claimed_by_profile_id = p_viewer_id
        OR public.is_elevated_privacy_viewer(p_viewer_id)
      )
  );
$function$;

DROP FUNCTION IF EXISTS public.get_convention_leaderboard(uuid);
CREATE OR REPLACE FUNCTION public.get_convention_leaderboard(p_convention_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(catcher_id uuid, convention_id uuid, username text, catch_count bigint, unique_fursuits bigint, unique_species bigint, last_catch_at timestamp with time zone, first_catch_at timestamp with time zone, profile_redacted boolean)
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
      c.catcher_id,
      c.convention_id,
      count(*) AS catch_count,
      count(distinct c.fursuit_id) AS unique_fursuits,
      count(distinct f.species_id) AS unique_species,
      max(c.caught_at) AS last_catch_at,
      min(c.caught_at) AS first_catch_at
    FROM public.catches c
    JOIN public.fursuits f ON f.id = c.fursuit_id
    CROSS JOIN auth_context cu
    WHERE cu.id IS NOT NULL
      AND c.status = 'ACCEPTED'
      AND c.catch_credit_scope = 'full'
      AND (p_convention_id IS NULL OR c.convention_id = p_convention_id)
    GROUP BY c.catcher_id, c.convention_id
  )
  SELECT
    l.catcher_id,
    l.convention_id,
    CASE
      WHEN public.can_view_profile(cu.id, l.catcher_id) THEN p.username
      ELSE NULL
    END AS username,
    l.catch_count,
    l.unique_fursuits,
    l.unique_species,
    l.last_catch_at,
    l.first_catch_at,
    NOT public.can_view_profile(cu.id, l.catcher_id) AS profile_redacted
  FROM leaderboard l
  JOIN public.profiles p ON p.id = l.catcher_id
  CROSS JOIN auth_context cu
  ORDER BY l.catch_count DESC, profile_redacted ASC, l.catcher_id ASC;
$function$;

DROP FUNCTION IF EXISTS public.get_convention_suit_leaderboard(uuid);
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
    CASE WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN f.owner_id ELSE NULL END AS owner_id,
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

DROP FUNCTION IF EXISTS public.get_convention_suit_roster_caught_ids(uuid);
CREATE OR REPLACE FUNCTION public.get_convention_suit_roster_caught_ids(p_convention_id uuid)
RETURNS TABLE(fursuit_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT DISTINCT c.fursuit_id
  FROM public.catches c
  WHERE auth.uid() IS NOT NULL
    AND c.convention_id = p_convention_id
    AND c.catcher_id = auth.uid()
    AND c.status = 'ACCEPTED'
    AND c.catch_credit_scope = 'full';
$function$;

REVOKE ALL ON FUNCTION public.create_catch_invite(uuid, text, text, text, text, uuid, text, timestamp with time zone)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_catch_invite(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_catch_invite(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decline_catch_invite(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_catch_invite(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_catch_invites() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_catch_invite(uuid, text, text, text, text, uuid, text, timestamp with time zone)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_catch_invite(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_catch_invite(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.decline_catch_invite(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_catch_invite(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_catch_invites() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_convention_leaderboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_convention_suit_leaderboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_convention_suit_roster_caught_ids(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
