-- Add per-catch reciprocal offers for bidirectional tagging.

CREATE TABLE IF NOT EXISTS public.catch_reciprocal_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_catch_id uuid NOT NULL REFERENCES public.catches(id) ON DELETE CASCADE,
  offered_fursuit_id uuid NOT NULL REFERENCES public.fursuits(id) ON DELETE CASCADE,
  offered_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  convention_id uuid NOT NULL REFERENCES public.conventions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING',
  reciprocal_catch_id uuid REFERENCES public.catches(id) ON DELETE SET NULL,
  failure_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  CONSTRAINT catch_reciprocal_offers_status_check
    CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELED')),
  CONSTRAINT catch_reciprocal_offers_not_self_recipient_check
    CHECK (offered_by_profile_id <> recipient_profile_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS catch_reciprocal_offers_primary_catch_idx
  ON public.catch_reciprocal_offers (primary_catch_id);

CREATE INDEX IF NOT EXISTS catch_reciprocal_offers_status_idx
  ON public.catch_reciprocal_offers (status);

ALTER TABLE public.catch_reciprocal_offers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.catch_reciprocal_offers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.catch_reciprocal_offers TO service_role;

CREATE OR REPLACE FUNCTION public.validate_catch_reciprocal_offer(
  p_primary_catch_id uuid,
  p_offered_by_profile_id uuid,
  p_offered_fursuit_id uuid
)
RETURNS TABLE (
  recipient_profile_id uuid,
  convention_id uuid,
  offered_fursuit_name text,
  offered_fursuit_avatar_path text,
  offered_fursuit_avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_primary record;
  v_offered record;
BEGIN
  SELECT
    c.id,
    c.catcher_id,
    c.fursuit_id,
    c.convention_id,
    c.status,
    c.catch_photo_source,
    f.owner_id AS caught_fursuit_owner_id
  INTO v_primary
  FROM public.catches c
  JOIN public.fursuits f ON f.id = c.fursuit_id
  WHERE c.id = p_primary_catch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Primary catch not found';
  END IF;

  IF v_primary.catcher_id IS DISTINCT FROM p_offered_by_profile_id THEN
    RAISE EXCEPTION 'Reciprocal offer must be created by the primary catcher';
  END IF;

  IF v_primary.convention_id IS NULL THEN
    RAISE EXCEPTION 'Reciprocal offers require a convention';
  END IF;

  SELECT
    f.id,
    f.owner_id,
    f.name,
    f.avatar_path,
    f.avatar_url,
    f.is_tutorial,
    f.is_flagged
  INTO v_offered
  FROM public.fursuits f
  WHERE f.id = p_offered_fursuit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offered fursuit not found';
  END IF;

  IF v_offered.owner_id IS DISTINCT FROM p_offered_by_profile_id THEN
    RAISE EXCEPTION 'You can only offer one of your own fursuits';
  END IF;

  IF COALESCE(v_offered.is_tutorial, false) THEN
    RAISE EXCEPTION 'Tutorial fursuits cannot be offered for reciprocal catches';
  END IF;

  IF COALESCE(v_offered.is_flagged, false) THEN
    RAISE EXCEPTION 'This fursuit cannot be offered for reciprocal catches';
  END IF;

  IF v_primary.caught_fursuit_owner_id IS NULL
     OR v_primary.caught_fursuit_owner_id = p_offered_by_profile_id THEN
    RAISE EXCEPTION 'Reciprocal recipient is not valid';
  END IF;

  IF public.is_blocked(p_offered_by_profile_id, v_primary.caught_fursuit_owner_id) THEN
    RAISE EXCEPTION 'Cannot create reciprocal catch for this player';
  END IF;

  IF v_primary.catch_photo_source = 'gallery' THEN
    IF NOT public.is_profile_convention_gallery_catch_eligible(
      p_offered_by_profile_id,
      v_primary.convention_id
    ) THEN
      RAISE EXCEPTION 'Offering player must be eligible for gallery catches at this convention';
    END IF;

    IF NOT public.is_profile_convention_gallery_catch_eligible(
      v_primary.caught_fursuit_owner_id,
      v_primary.convention_id
    ) THEN
      RAISE EXCEPTION 'Recipient must be eligible for gallery catches at this convention';
    END IF;
  ELSIF NOT public.is_profile_convention_gameplay_eligible(
    p_offered_by_profile_id,
    v_primary.convention_id
  ) THEN
    RAISE EXCEPTION 'Offering player must be ready to catch for this convention';
  ELSIF NOT public.is_profile_convention_gameplay_eligible(
    v_primary.caught_fursuit_owner_id,
    v_primary.convention_id
  ) THEN
    RAISE EXCEPTION 'Recipient must be ready to catch for this convention';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.fursuit_conventions fc
    WHERE fc.fursuit_id = p_offered_fursuit_id
      AND fc.convention_id = v_primary.convention_id
      AND fc.roster_state = 'active'
      AND fc.active_until IS NULL
  ) THEN
    RAISE EXCEPTION 'Offered fursuit must be listed for this convention';
  END IF;

  IF NOT public.can_catch_fursuit_as_profile(
    v_primary.caught_fursuit_owner_id,
    p_offered_fursuit_id
  ) THEN
    RAISE EXCEPTION 'Adult boundary restricted reciprocal catch'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catches c
    WHERE c.fursuit_id = p_offered_fursuit_id
      AND c.catcher_id = v_primary.caught_fursuit_owner_id
      AND c.convention_id = v_primary.convention_id
      AND c.status IN ('ACCEPTED', 'PENDING')
  ) THEN
    RAISE EXCEPTION 'Reciprocal fursuit already caught at this convention';
  END IF;

  RETURN QUERY
  SELECT
    v_primary.caught_fursuit_owner_id,
    v_primary.convention_id,
    v_offered.name,
    v_offered.avatar_path,
    v_offered.avatar_url;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_catch_reciprocal_offer(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_catch_reciprocal_offer(uuid, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.process_catch_reciprocal_offer(p_offer_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_offer record;
  v_validation record;
  v_reciprocal_catch_id uuid;
  v_catch_number integer;
  v_event_id uuid;
  v_event_duplicate boolean := false;
  v_event_enqueued boolean := false;
  v_client_attempt_id text;
BEGIN
  SELECT
    o.*,
    c.status AS primary_status,
    c.is_tutorial AS primary_is_tutorial
  INTO v_offer
  FROM public.catch_reciprocal_offers o
  JOIN public.catches c ON c.id = o.primary_catch_id
  WHERE o.id = p_offer_id
  FOR UPDATE OF o;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'NOT_FOUND');
  END IF;

  IF v_offer.status <> 'PENDING' THEN
    RETURN json_build_object(
      'offer_id', v_offer.id,
      'status', v_offer.status,
      'reciprocal_catch_id', v_offer.reciprocal_catch_id,
      'failure_reason', v_offer.failure_reason,
      'event_enqueued', false
    );
  END IF;

  IF v_offer.primary_status IN ('REJECTED', 'EXPIRED') THEN
    UPDATE public.catch_reciprocal_offers
       SET status = 'CANCELED',
           failure_reason = 'Primary catch was not accepted',
           updated_at = now(),
           processed_at = now()
     WHERE id = v_offer.id;

    RETURN json_build_object(
      'offer_id', v_offer.id,
      'status', 'CANCELED',
      'failure_reason', 'Primary catch was not accepted',
      'event_enqueued', false
    );
  END IF;

  IF v_offer.primary_status <> 'ACCEPTED' THEN
    RETURN json_build_object(
      'offer_id', v_offer.id,
      'status', 'PENDING',
      'event_enqueued', false
    );
  END IF;

  BEGIN
    SELECT *
      INTO v_validation
    FROM public.validate_catch_reciprocal_offer(
      v_offer.primary_catch_id,
      v_offer.offered_by_profile_id,
      v_offer.offered_fursuit_id
    )
    LIMIT 1;

    v_client_attempt_id := format('reciprocal:%s', v_offer.id);

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
      v_offer.offered_fursuit_id,
      v_offer.recipient_profile_id,
      v_offer.convention_id,
      COALESCE(v_offer.primary_is_tutorial, false),
      'ACCEPTED',
      NULL,
      now(),
      NULL,
      NULL,
      NULL,
      v_client_attempt_id,
      'not_required'
    )
    RETURNING id, catch_number INTO v_reciprocal_catch_id, v_catch_number;

    SELECT event_id, duplicate, enqueued
      INTO v_event_id, v_event_duplicate, v_event_enqueued
    FROM app_private.ingest_gameplay_event(
      'catch_performed',
      v_offer.recipient_profile_id,
      v_offer.convention_id,
      jsonb_build_object(
        'catch_id', v_reciprocal_catch_id,
        'fursuit_id', v_offer.offered_fursuit_id,
        'catcher_id', v_offer.recipient_profile_id,
        'fursuit_owner_id', v_offer.offered_by_profile_id,
        'convention_id', v_offer.convention_id,
        'is_tutorial', COALESCE(v_offer.primary_is_tutorial, false),
        'status', 'ACCEPTED',
        'source', 'reciprocal_offer',
        'primary_catch_id', v_offer.primary_catch_id,
        'reciprocal_offer_id', v_offer.id,
        'client_attempt_id', v_client_attempt_id
      ),
      now(),
      format('catch:%s:%s', v_reciprocal_catch_id, 'catch_performed')
    );

    UPDATE public.catch_reciprocal_offers
       SET status = 'COMPLETED',
           reciprocal_catch_id = v_reciprocal_catch_id,
           failure_reason = NULL,
           updated_at = now(),
           processed_at = now()
     WHERE id = v_offer.id;

    RETURN json_build_object(
      'offer_id', v_offer.id,
      'status', 'COMPLETED',
      'reciprocal_catch_id', v_reciprocal_catch_id,
      'catch_number', v_catch_number,
      'event_id', v_event_id,
      'event_duplicate', COALESCE(v_event_duplicate, false),
      'event_enqueued', COALESCE(v_event_enqueued, false),
      'fursuit_id', v_offer.offered_fursuit_id,
      'fursuit_name', v_validation.offered_fursuit_name
    );
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE public.catch_reciprocal_offers
         SET status = 'FAILED',
             failure_reason = 'Reciprocal catch already exists',
             updated_at = now(),
             processed_at = now()
       WHERE id = v_offer.id;

      RETURN json_build_object(
        'offer_id', v_offer.id,
        'status', 'FAILED',
        'failure_reason', 'Reciprocal catch already exists',
        'event_enqueued', false
      );
    WHEN OTHERS THEN
      RAISE WARNING 'process_catch_reciprocal_offer failed for offer %: %', v_offer.id, SQLERRM;

      UPDATE public.catch_reciprocal_offers
         SET status = 'FAILED',
             failure_reason = 'DB_ERROR',
             updated_at = now(),
             processed_at = now()
       WHERE id = v_offer.id;

      RETURN json_build_object(
        'offer_id', v_offer.id,
        'status', 'FAILED',
        'failure_reason', 'DB_ERROR',
        'event_enqueued', false
      );
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_catch_reciprocal_offer(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_catch_reciprocal_offer(uuid)
  TO service_role;

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
  v_offer_id uuid;
  v_existing_offer record;
  v_process_result json;
BEGIN
  SELECT *
    INTO v_existing_offer
  FROM public.catch_reciprocal_offers
  WHERE primary_catch_id = p_primary_catch_id
  LIMIT 1;

  IF FOUND AND v_existing_offer.status NOT IN ('FAILED', 'CANCELED') THEN
    RETURN json_build_object(
      'offer_id', v_existing_offer.id,
      'status', v_existing_offer.status,
      'reciprocal_catch_id', v_existing_offer.reciprocal_catch_id,
      'failure_reason', v_existing_offer.failure_reason,
      'event_enqueued', false,
      'offered_fursuit_id', v_existing_offer.offered_fursuit_id,
      'recipient_profile_id', v_existing_offer.recipient_profile_id
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
    'recipient_profile_id', v_validation.recipient_profile_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_catch_reciprocal_offer(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_catch_reciprocal_offer(uuid, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.handle_catch_reciprocal_offer_primary_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_offer record;
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'ACCEPTED' THEN
    FOR v_offer IN
      SELECT id
      FROM public.catch_reciprocal_offers
      WHERE primary_catch_id = NEW.id
        AND status = 'PENDING'
    LOOP
      PERFORM public.process_catch_reciprocal_offer(v_offer.id);
    END LOOP;
  ELSIF NEW.status IN ('REJECTED', 'EXPIRED') THEN
    UPDATE public.catch_reciprocal_offers
       SET status = 'CANCELED',
           failure_reason = 'Primary catch was not accepted',
           updated_at = now(),
           processed_at = now()
     WHERE primary_catch_id = NEW.id
       AND status = 'PENDING';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS handle_catch_reciprocal_offer_primary_status_trigger
  ON public.catches;

CREATE TRIGGER handle_catch_reciprocal_offer_primary_status_trigger
  AFTER UPDATE OF status ON public.catches
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_catch_reciprocal_offer_primary_status();

DROP FUNCTION IF EXISTS public.get_pending_catches(uuid);

CREATE OR REPLACE FUNCTION public.get_pending_catches(p_user_id uuid)
RETURNS TABLE (
  catch_id uuid,
  catcher_id uuid,
  catcher_username text,
  catcher_avatar_url text,
  fursuit_id uuid,
  fursuit_name text,
  fursuit_avatar_url text,
  caught_at timestamp with time zone,
  expires_at timestamp with time zone,
  convention_id uuid,
  convention_name text,
  time_remaining interval,
  catch_photo_url text,
  catch_photo_source text,
  photo_upload_state text,
  reciprocal_offer_id uuid,
  reciprocal_fursuit_id uuid,
  reciprocal_fursuit_name text,
  reciprocal_fursuit_avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    c.id AS catch_id,
    c.catcher_id,
    p.username AS catcher_username,
    p.avatar_url AS catcher_avatar_url,
    c.fursuit_id,
    f.name AS fursuit_name,
    f.avatar_url AS fursuit_avatar_url,
    c.caught_at,
    c.expires_at,
    c.convention_id,
    conv.name AS convention_name,
    (c.expires_at - now()) AS time_remaining,
    c.catch_photo_url,
    c.catch_photo_source,
    c.photo_upload_state,
    cro.id AS reciprocal_offer_id,
    cro.offered_fursuit_id AS reciprocal_fursuit_id,
    rf.name AS reciprocal_fursuit_name,
    rf.avatar_url AS reciprocal_fursuit_avatar_url
  FROM public.catches c
  JOIN public.fursuits f ON c.fursuit_id = f.id
  JOIN public.profiles p ON c.catcher_id = p.id
  LEFT JOIN public.conventions conv ON c.convention_id = conv.id
  LEFT JOIN public.catch_reciprocal_offers cro
    ON cro.primary_catch_id = c.id
   AND cro.status = 'PENDING'
  LEFT JOIN public.fursuits rf ON rf.id = cro.offered_fursuit_id
  WHERE f.owner_id = p_user_id
    AND c.status = 'PENDING'
    AND c.expires_at > now()
    AND (
      c.catch_photo_source IS NULL
      OR c.photo_upload_state = 'uploaded'
    )
  ORDER BY c.caught_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_pending_catches(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_catch(
  p_catch_id uuid,
  p_decision text,
  p_user_id uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_catch record;
  v_new_status text;
  v_result json;
  v_decided_at timestamptz := now();
  v_reciprocal_offer json := NULL;
BEGIN
  IF p_decision NOT IN ('accept', 'reject') THEN
    RAISE EXCEPTION 'Invalid decision. Must be accept or reject';
  END IF;

  SELECT
    c.*,
    f.owner_id,
    f.name AS fursuit_name,
    f.is_tutorial AS fursuit_is_tutorial,
    fs.name AS species_name,
    COALESCE((
      SELECT jsonb_agg(fc.name ORDER BY fca.position)
      FROM public.fursuit_color_assignments fca
      JOIN public.fursuit_colors fc ON fc.id = fca.color_id
      WHERE fca.fursuit_id = c.fursuit_id
    ), '[]'::jsonb) AS color_names,
    p.username AS catcher_username
  INTO v_catch
  FROM public.catches c
  JOIN public.fursuits f ON c.fursuit_id = f.id
  JOIN public.profiles p ON c.catcher_id = p.id
  LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
  WHERE c.id = p_catch_id
    AND c.status = 'PENDING'
    AND c.expires_at > now()
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catch not found or already decided';
  END IF;

  IF v_catch.owner_id != p_user_id THEN
    RAISE EXCEPTION 'You do not own this fursuit';
  END IF;

  v_new_status := CASE
    WHEN p_decision = 'accept' THEN 'ACCEPTED'
    ELSE 'REJECTED'
  END;

  UPDATE public.catches
     SET status = v_new_status,
         decided_at = v_decided_at,
         decided_by_user_id = p_user_id,
         rejection_reason = CASE WHEN p_decision = 'reject' THEN p_reason ELSE NULL END
   WHERE id = p_catch_id;

  PERFORM public.notify_catch_decision(
    p_catch_id,
    v_catch.catcher_id,
    v_catch.fursuit_id,
    v_catch.fursuit_name,
    p_decision,
    p_reason
  );

  IF p_decision = 'accept' THEN
    PERFORM app_private.ingest_gameplay_event(
      'catch_confirmed',
      v_catch.catcher_id,
      v_catch.convention_id,
      jsonb_build_object(
        'catch_id', p_catch_id,
        'decision', p_decision
      ),
      v_decided_at,
      format('catch:%s:confirmed', p_catch_id)
    );

    SELECT json_build_object(
      'offer_id', o.id,
      'status', o.status,
      'reciprocal_catch_id', o.reciprocal_catch_id,
      'failure_reason', o.failure_reason
    )
    INTO v_reciprocal_offer
    FROM public.catch_reciprocal_offers o
    WHERE o.primary_catch_id = p_catch_id
    LIMIT 1;

    BEGIN
      PERFORM public.process_gameplay_queue_if_active();
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'confirm_catch failed to wake gameplay queue for catch %: %', p_catch_id, SQLERRM;
    END;
  END IF;

  SELECT json_build_object(
    'success', true,
    'catch_id', p_catch_id,
    'decision', p_decision,
    'status', v_new_status,
    'fursuit_name', v_catch.fursuit_name,
    'catcher_id', v_catch.catcher_id,
    'fursuit_id', v_catch.fursuit_id,
    'convention_id', v_catch.convention_id,
    'reciprocal_offer', v_reciprocal_offer
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
