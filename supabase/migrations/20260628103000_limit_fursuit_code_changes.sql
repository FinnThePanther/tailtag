CREATE TABLE IF NOT EXISTS public.fursuit_code_change_allowances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_fursuit_id uuid,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_reason text,
  granted_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  consumed_at timestamp with time zone,
  consumed_fursuit_id uuid,
  consumed_from_code text,
  consumed_to_code text,
  CONSTRAINT fursuit_code_change_allowances_source_check CHECK (
    source IN ('existing_fursuit', 'fursuit_created', 'admin_grant')
  ),
  CONSTRAINT fursuit_code_change_allowances_consumed_check CHECK (
    (
      consumed_at IS NULL
      AND consumed_fursuit_id IS NULL
      AND consumed_from_code IS NULL
      AND consumed_to_code IS NULL
    )
    OR (
      consumed_at IS NOT NULL
      AND consumed_fursuit_id IS NOT NULL
      AND consumed_from_code IS NOT NULL
      AND consumed_to_code IS NOT NULL
    )
  )
);

ALTER TABLE public.fursuit_code_change_allowances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.fursuit_code_change_allowances FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.fursuit_code_change_allowances TO service_role;

CREATE INDEX IF NOT EXISTS fursuit_code_change_allowances_owner_unconsumed_idx
ON public.fursuit_code_change_allowances (owner_id, granted_at, id)
WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS fursuit_code_change_allowances_owner_consumed_idx
ON public.fursuit_code_change_allowances (owner_id, consumed_fursuit_id)
WHERE consumed_fursuit_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fursuit_code_change_allowances_one_use_per_suit_idx
ON public.fursuit_code_change_allowances (owner_id, consumed_fursuit_id)
WHERE consumed_fursuit_id IS NOT NULL;

INSERT INTO public.fursuit_code_change_allowances (
  owner_id,
  source,
  source_fursuit_id,
  granted_reason
)
SELECT
  f.owner_id,
  'existing_fursuit',
  f.id,
  'Initial one-time catch code change grant for existing fursuit'
FROM public.fursuits f
WHERE coalesce(f.is_tutorial, false) = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.fursuit_code_change_allowances a
    WHERE a.owner_id = f.owner_id
      AND a.source = 'existing_fursuit'
      AND a.source_fursuit_id = f.id
  );

CREATE OR REPLACE FUNCTION public.grant_fursuit_code_change_allowance_for_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_active_fursuit_count integer := 0;
  v_baseline_grant_count integer := 0;
BEGIN
  IF coalesce(NEW.is_tutorial, false) THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO v_active_fursuit_count
  FROM public.fursuits f
  WHERE f.owner_id = NEW.owner_id
    AND coalesce(f.is_tutorial, false) = false;

  SELECT count(*)
  INTO v_baseline_grant_count
  FROM public.fursuit_code_change_allowances a
  WHERE a.owner_id = NEW.owner_id
    AND a.source IN ('existing_fursuit', 'fursuit_created');

  IF v_baseline_grant_count < v_active_fursuit_count THEN
    INSERT INTO public.fursuit_code_change_allowances (
      owner_id,
      source,
      source_fursuit_id,
      granted_reason
    )
    VALUES (
      NEW.owner_id,
      'fursuit_created',
      NEW.id,
      'One-time catch code change grant for new fursuit slot'
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fursuits_grant_code_change_allowance ON public.fursuits;
CREATE TRIGGER fursuits_grant_code_change_allowance
AFTER INSERT ON public.fursuits
FOR EACH ROW
EXECUTE FUNCTION public.grant_fursuit_code_change_allowance_for_insert();

CREATE OR REPLACE FUNCTION public.grant_fursuit_code_change_allowance(
  p_owner_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_allowance_id uuid;
BEGIN
  INSERT INTO public.fursuit_code_change_allowances (
    owner_id,
    source,
    granted_by,
    granted_reason
  )
  VALUES (
    p_owner_id,
    'admin_grant',
    auth.uid(),
    NULLIF(btrim(coalesce(p_reason, '')), '')
  )
  RETURNING id INTO v_allowance_id;

  RETURN v_allowance_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.grant_fursuit_code_change_allowance(uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_fursuit_code_change_allowance(uuid, text)
TO service_role;

CREATE OR REPLACE FUNCTION public.get_fursuit_code_change_status(p_fursuit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_fursuit_owner_id uuid;
  v_has_changed_code boolean := false;
  v_remaining_changes integer := 0;
BEGIN
  IF v_viewer_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'fursuit_id', p_fursuit_id,
      'remaining_changes', 0,
      'has_changed_code', false
    );
  END IF;

  SELECT f.owner_id
  INTO v_fursuit_owner_id
  FROM public.fursuits f
  WHERE f.id = p_fursuit_id
    AND f.owner_id = v_viewer_id;

  IF v_fursuit_owner_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'fursuit_id', p_fursuit_id,
      'remaining_changes', 0,
      'has_changed_code', false
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.fursuit_code_change_allowances a
    WHERE a.owner_id = v_viewer_id
      AND a.consumed_fursuit_id = p_fursuit_id
  )
  INTO v_has_changed_code;

  SELECT count(*)
  INTO v_remaining_changes
  FROM public.fursuit_code_change_allowances a
  WHERE a.owner_id = v_viewer_id
    AND a.consumed_at IS NULL;

  RETURN jsonb_build_object(
    'status',
    CASE
      WHEN v_has_changed_code OR v_remaining_changes <= 0 THEN 'locked'
      ELSE 'available'
    END,
    'fursuit_id', p_fursuit_id,
    'remaining_changes', greatest(v_remaining_changes, 0),
    'has_changed_code', v_has_changed_code
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fursuit_code_change_status(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_fursuit_code_change_status(uuid)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_fursuit_unique_code_change_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_normalized_old_code text := upper(btrim(coalesce(OLD.unique_code, '')));
  v_normalized_new_code text := upper(btrim(coalesce(NEW.unique_code, '')));
  v_allowance_id uuid;
BEGIN
  IF v_normalized_old_code IS NOT DISTINCT FROM v_normalized_new_code THEN
    NEW.unique_code = v_normalized_new_code;
    RETURN NEW;
  END IF;

  IF v_normalized_new_code !~ '^[A-Z0-9]{4,8}$' THEN
    RAISE EXCEPTION 'Unique code must be 4 to 8 letters or numbers'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fursuit_code_change_allowances a
    WHERE a.owner_id = OLD.owner_id
      AND a.consumed_fursuit_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'fursuit_code_change_locked'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT a.id
  INTO v_allowance_id
  FROM public.fursuit_code_change_allowances a
  WHERE a.owner_id = OLD.owner_id
    AND a.consumed_at IS NULL
  ORDER BY a.granted_at, a.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_allowance_id IS NULL THEN
    RAISE EXCEPTION 'fursuit_code_change_locked'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.fursuit_code_change_allowances
  SET
    consumed_at = timezone('utc'::text, now()),
    consumed_fursuit_id = OLD.id,
    consumed_from_code = v_normalized_old_code,
    consumed_to_code = v_normalized_new_code
  WHERE id = v_allowance_id;

  NEW.unique_code = v_normalized_new_code;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fursuits_enforce_unique_code_change_limit ON public.fursuits;
CREATE TRIGGER fursuits_enforce_unique_code_change_limit
BEFORE UPDATE OF unique_code ON public.fursuits
FOR EACH ROW
EXECUTE FUNCTION public.enforce_fursuit_unique_code_change_limit();

CREATE OR REPLACE FUNCTION public.update_fursuit_profile(
  p_fursuit_id uuid,
  p_name text,
  p_species_id uuid,
  p_visibility_audience text,
  p_owner_attribution_visibility text,
  p_social_signal text,
  p_interaction_badges text[],
  p_unique_code text,
  p_avatar_path text,
  p_avatar_url text,
  p_avatar_changed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_normalized_code text := upper(btrim(coalesce(p_unique_code, '')));
  v_previous_code text;
  v_previous_normalized_code text;
  v_code_changed boolean := false;
  v_updated_count integer := 0;
BEGIN
  IF v_viewer_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'fursuit_id', p_fursuit_id,
      'unique_code', NULL
    );
  END IF;

  SELECT f.unique_code
  INTO v_previous_code
  FROM public.fursuits f
  WHERE f.id = p_fursuit_id
    AND f.owner_id = v_viewer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'fursuit_id', p_fursuit_id,
      'unique_code', NULL
    );
  END IF;

  IF v_normalized_code !~ '^[A-Z0-9]{4,8}$' THEN
    RAISE EXCEPTION 'Unique code must be 4 to 8 letters or numbers'
      USING ERRCODE = '22023';
  END IF;

  v_previous_normalized_code := upper(btrim(coalesce(v_previous_code, '')));
  v_code_changed := v_previous_normalized_code IS DISTINCT FROM v_normalized_code;

  IF v_code_changed THEN
    IF EXISTS (
      SELECT 1
      FROM public.fursuit_code_change_allowances a
      WHERE a.owner_id = v_viewer_id
        AND a.consumed_fursuit_id = p_fursuit_id
    ) THEN
      RETURN jsonb_build_object(
        'status', 'code_change_locked',
        'fursuit_id', p_fursuit_id,
        'unique_code', v_previous_normalized_code
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.fursuit_code_change_allowances a
      WHERE a.owner_id = v_viewer_id
        AND a.consumed_at IS NULL
    ) THEN
      RETURN jsonb_build_object(
        'status', 'code_change_locked',
        'fursuit_id', p_fursuit_id,
        'unique_code', v_previous_normalized_code
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fursuits f
    WHERE upper(f.unique_code) = v_normalized_code
      AND f.id <> p_fursuit_id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'code_taken',
      'fursuit_id', p_fursuit_id,
      'unique_code', v_normalized_code
    );
  END IF;

  BEGIN
    UPDATE public.fursuits
    SET
      name = p_name,
      species_id = p_species_id,
      visibility_audience = p_visibility_audience,
      owner_attribution_visibility = p_owner_attribution_visibility,
      social_signal = p_social_signal,
      interaction_badges = coalesce(p_interaction_badges, '{}'::text[]),
      unique_code = v_normalized_code,
      avatar_path = CASE WHEN p_avatar_changed THEN p_avatar_path ELSE avatar_path END,
      avatar_url = CASE WHEN p_avatar_changed THEN p_avatar_url ELSE avatar_url END
    WHERE id = p_fursuit_id
      AND owner_id = v_viewer_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'status', 'code_taken',
        'fursuit_id', p_fursuit_id,
        'unique_code', v_normalized_code
      );
    WHEN raise_exception THEN
      IF SQLERRM = 'fursuit_code_change_locked' THEN
        RETURN jsonb_build_object(
          'status', 'code_change_locked',
          'fursuit_id', p_fursuit_id,
          'unique_code', v_previous_normalized_code
        );
      END IF;

      RAISE;
  END;

  IF v_updated_count = 0 THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'fursuit_id', p_fursuit_id,
      'unique_code', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'updated',
    'fursuit_id', p_fursuit_id,
    'unique_code', v_normalized_code
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_fursuit_profile(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  boolean
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_fursuit_profile(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  boolean
)
TO authenticated, service_role;
