ALTER TABLE public.fursuits
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

UPDATE public.fursuits
SET updated_at = coalesce(created_at, timezone('utc'::text, now()))
WHERE updated_at IS NULL;

ALTER TABLE public.fursuits
ALTER COLUMN updated_at SET DEFAULT timezone('utc'::text, now()),
ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_fursuits_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $function$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_fursuits_updated_at ON public.fursuits;
CREATE TRIGGER set_fursuits_updated_at
BEFORE UPDATE ON public.fursuits
FOR EACH ROW
EXECUTE FUNCTION public.set_fursuits_updated_at();

CREATE TABLE IF NOT EXISTS public.fursuit_unique_code_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fursuit_id uuid NOT NULL REFERENCES public.fursuits(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source text NOT NULL,
  old_code text,
  new_code text NOT NULL,
  client_attempt_id text,
  client_app_version text,
  client_platform text,
  changed_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT fursuit_unique_code_history_client_attempt_length_check CHECK (
    client_attempt_id IS NULL
    OR length(client_attempt_id) <= 128
  ),
  CONSTRAINT fursuit_unique_code_history_client_app_version_length_check CHECK (
    client_app_version IS NULL
    OR length(client_app_version) <= 80
  ),
  CONSTRAINT fursuit_unique_code_history_client_platform_length_check CHECK (
    client_platform IS NULL
    OR length(client_platform) <= 40
  ),
  CONSTRAINT fursuit_unique_code_history_source_check CHECK (
    source IN ('create', 'edit', 'admin')
  )
);

ALTER TABLE public.fursuit_unique_code_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.fursuit_unique_code_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.fursuit_unique_code_history TO service_role;

CREATE INDEX IF NOT EXISTS fursuit_unique_code_history_fursuit_changed_idx
ON public.fursuit_unique_code_history (fursuit_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS fursuit_unique_code_history_owner_changed_idx
ON public.fursuit_unique_code_history (owner_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS fursuit_unique_code_history_client_attempt_idx
ON public.fursuit_unique_code_history (client_attempt_id)
WHERE client_attempt_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fursuit_unique_code_history_one_create_per_fursuit_idx
ON public.fursuit_unique_code_history (fursuit_id)
WHERE source = 'create';

CREATE TABLE IF NOT EXISTS public.fursuit_code_change_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fursuit_id uuid,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attempted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  previous_code text,
  attempted_code text NOT NULL,
  result text NOT NULL,
  conflicting_fursuit_id uuid,
  client_attempt_id text,
  client_app_version text,
  client_platform text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT fursuit_code_change_attempts_client_attempt_length_check CHECK (
    client_attempt_id IS NULL
    OR length(client_attempt_id) <= 128
  ),
  CONSTRAINT fursuit_code_change_attempts_client_app_version_length_check CHECK (
    client_app_version IS NULL
    OR length(client_app_version) <= 80
  ),
  CONSTRAINT fursuit_code_change_attempts_client_platform_length_check CHECK (
    client_platform IS NULL
    OR length(client_platform) <= 40
  ),
  CONSTRAINT fursuit_code_change_attempts_result_check CHECK (
    result IN (
      'updated',
      'unchanged',
      'code_taken',
      'code_change_locked',
      'code_invalid',
      'not_found'
    )
  )
);

ALTER TABLE public.fursuit_code_change_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.fursuit_code_change_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.fursuit_code_change_attempts TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fursuit_unique_code_history_client_attempt_length_check'
      AND conrelid = 'public.fursuit_unique_code_history'::regclass
  ) THEN
    ALTER TABLE public.fursuit_unique_code_history
    ADD CONSTRAINT fursuit_unique_code_history_client_attempt_length_check CHECK (
      client_attempt_id IS NULL
      OR length(client_attempt_id) <= 128
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fursuit_unique_code_history_client_app_version_length_check'
      AND conrelid = 'public.fursuit_unique_code_history'::regclass
  ) THEN
    ALTER TABLE public.fursuit_unique_code_history
    ADD CONSTRAINT fursuit_unique_code_history_client_app_version_length_check CHECK (
      client_app_version IS NULL
      OR length(client_app_version) <= 80
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fursuit_unique_code_history_client_platform_length_check'
      AND conrelid = 'public.fursuit_unique_code_history'::regclass
  ) THEN
    ALTER TABLE public.fursuit_unique_code_history
    ADD CONSTRAINT fursuit_unique_code_history_client_platform_length_check CHECK (
      client_platform IS NULL
      OR length(client_platform) <= 40
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fursuit_code_change_attempts_client_attempt_length_check'
      AND conrelid = 'public.fursuit_code_change_attempts'::regclass
  ) THEN
    ALTER TABLE public.fursuit_code_change_attempts
    ADD CONSTRAINT fursuit_code_change_attempts_client_attempt_length_check CHECK (
      client_attempt_id IS NULL
      OR length(client_attempt_id) <= 128
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fursuit_code_change_attempts_client_app_version_length_check'
      AND conrelid = 'public.fursuit_code_change_attempts'::regclass
  ) THEN
    ALTER TABLE public.fursuit_code_change_attempts
    ADD CONSTRAINT fursuit_code_change_attempts_client_app_version_length_check CHECK (
      client_app_version IS NULL
      OR length(client_app_version) <= 80
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fursuit_code_change_attempts_client_platform_length_check'
      AND conrelid = 'public.fursuit_code_change_attempts'::regclass
  ) THEN
    ALTER TABLE public.fursuit_code_change_attempts
    ADD CONSTRAINT fursuit_code_change_attempts_client_platform_length_check CHECK (
      client_platform IS NULL
      OR length(client_platform) <= 40
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS fursuit_code_change_attempts_fursuit_created_idx
ON public.fursuit_code_change_attempts (fursuit_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fursuit_code_change_attempts_owner_created_idx
ON public.fursuit_code_change_attempts (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fursuit_code_change_attempts_client_attempt_idx
ON public.fursuit_code_change_attempts (client_attempt_id)
WHERE client_attempt_id IS NOT NULL;

INSERT INTO public.fursuit_unique_code_history (
  fursuit_id,
  owner_id,
  changed_by,
  source,
  old_code,
  new_code,
  changed_at,
  metadata
)
SELECT
  f.id,
  f.owner_id,
  f.owner_id,
  'create',
  NULL,
  upper(btrim(f.unique_code)),
  coalesce(f.created_at, timezone('utc'::text, now())),
  jsonb_build_object('backfilled', true)
FROM public.fursuits f
WHERE NOT EXISTS (
  SELECT 1
  FROM public.fursuit_unique_code_history h
  WHERE h.fursuit_id = f.id
    AND h.source = 'create'
);

CREATE OR REPLACE FUNCTION public.log_fursuit_unique_code_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.fursuit_unique_code_history (
    fursuit_id,
    owner_id,
    changed_by,
    source,
    old_code,
    new_code,
    changed_at,
    metadata
  )
  SELECT
    NEW.id,
    NEW.owner_id,
    NEW.owner_id,
    'create',
    NULL,
    upper(btrim(NEW.unique_code)),
    coalesce(NEW.created_at, timezone('utc'::text, now())),
    jsonb_build_object('trigger', 'fursuits_after_insert')
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.fursuit_unique_code_history h
    WHERE h.fursuit_id = NEW.id
      AND h.source = 'create'
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fursuits_log_unique_code_create ON public.fursuits;
CREATE TRIGGER fursuits_log_unique_code_create
AFTER INSERT ON public.fursuits
FOR EACH ROW
EXECUTE FUNCTION public.log_fursuit_unique_code_create();

CREATE OR REPLACE FUNCTION public.log_fursuit_unique_code_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_changed_by uuid := auth.uid();
  v_old_code text := upper(btrim(coalesce(OLD.unique_code, '')));
  v_new_code text := upper(btrim(coalesce(NEW.unique_code, '')));
  v_client_attempt_id text := NULLIF(
    left(btrim(coalesce(current_setting('tailtag.client_attempt_id', true), '')), 128),
    ''
  );
  v_client_app_version text := NULLIF(
    left(btrim(coalesce(current_setting('tailtag.client_app_version', true), '')), 80),
    ''
  );
  v_client_platform text := NULLIF(
    left(btrim(coalesce(current_setting('tailtag.client_platform', true), '')), 40),
    ''
  );
BEGIN
  IF v_old_code IS NOT DISTINCT FROM v_new_code THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.fursuit_unique_code_history (
    fursuit_id,
    owner_id,
    changed_by,
    source,
    old_code,
    new_code,
    client_attempt_id,
    client_app_version,
    client_platform,
    changed_at,
    metadata
  )
  VALUES (
    NEW.id,
    NEW.owner_id,
    v_changed_by,
    CASE WHEN v_changed_by IS NULL THEN 'admin' ELSE 'edit' END,
    v_old_code,
    v_new_code,
    v_client_attempt_id,
    v_client_app_version,
    v_client_platform,
    timezone('utc'::text, now()),
    jsonb_build_object('trigger', 'fursuits_after_unique_code_update')
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fursuits_log_unique_code_update ON public.fursuits;
CREATE TRIGGER fursuits_log_unique_code_update
AFTER UPDATE OF unique_code ON public.fursuits
FOR EACH ROW
EXECUTE FUNCTION public.log_fursuit_unique_code_update();

CREATE OR REPLACE FUNCTION public.record_fursuit_code_change_attempt(
  p_fursuit_id uuid,
  p_owner_id uuid,
  p_attempted_by uuid,
  p_previous_code text,
  p_attempted_code text,
  p_result text,
  p_conflicting_fursuit_id uuid DEFAULT NULL,
  p_client_attempt_id text DEFAULT NULL,
  p_client_app_version text DEFAULT NULL,
  p_client_platform text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.fursuit_code_change_attempts (
    fursuit_id,
    owner_id,
    attempted_by,
    previous_code,
    attempted_code,
    result,
    conflicting_fursuit_id,
    client_attempt_id,
    client_app_version,
    client_platform,
    metadata
  )
  VALUES (
    p_fursuit_id,
    p_owner_id,
    p_attempted_by,
    NULLIF(upper(btrim(coalesce(p_previous_code, ''))), ''),
    upper(btrim(coalesce(p_attempted_code, ''))),
    p_result,
    p_conflicting_fursuit_id,
    NULLIF(left(btrim(coalesce(p_client_attempt_id, '')), 128), ''),
    NULLIF(left(btrim(coalesce(p_client_app_version, '')), 80), ''),
    NULLIF(left(btrim(coalesce(p_client_platform, '')), 40), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_fursuit_code_change_attempt(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  jsonb
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_fursuit_code_change_attempt(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  jsonb
)
TO service_role;

DROP FUNCTION IF EXISTS public.update_fursuit_profile(
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
);

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
  p_avatar_changed boolean,
  p_client_attempt_id text DEFAULT NULL,
  p_client_app_version text DEFAULT NULL,
  p_client_platform text DEFAULT NULL
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
  v_fursuit_owner_id uuid;
  v_code_changed boolean := false;
  v_updated_count integer := 0;
  v_conflicting_fursuit_id uuid;
  v_client_attempt_id text := NULLIF(left(btrim(coalesce(p_client_attempt_id, '')), 128), '');
  v_client_app_version text := NULLIF(left(btrim(coalesce(p_client_app_version, '')), 80), '');
  v_client_platform text := NULLIF(left(btrim(coalesce(p_client_platform, '')), 40), '');
  v_client_app_version_parts text[];
  v_supports_code_invalid_response boolean := false;
BEGIN
  IF v_viewer_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'fursuit_id', p_fursuit_id,
      'unique_code', NULL
    );
  END IF;

  SELECT f.unique_code, f.owner_id
  INTO v_previous_code, v_fursuit_owner_id
  FROM public.fursuits f
  WHERE f.id = p_fursuit_id
    AND f.owner_id = v_viewer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.record_fursuit_code_change_attempt(
      p_fursuit_id,
      v_viewer_id,
      v_viewer_id,
      NULL,
      v_normalized_code,
      'not_found',
      NULL,
      v_client_attempt_id,
      v_client_app_version,
      v_client_platform,
      jsonb_build_object('source', 'update_fursuit_profile')
    );

    RETURN jsonb_build_object(
      'status', 'not_found',
      'fursuit_id', p_fursuit_id,
      'unique_code', NULL
    );
  END IF;

  v_previous_normalized_code := upper(btrim(coalesce(v_previous_code, '')));
  v_code_changed := v_previous_normalized_code IS DISTINCT FROM v_normalized_code;

  v_client_app_version_parts := regexp_match(
    coalesce(v_client_app_version, ''),
    '^([0-9]+)\.([0-9]+)\.([0-9]+)(?:[^0-9].*)?$'
  );
  IF v_client_app_version_parts IS NOT NULL THEN
    v_supports_code_invalid_response :=
      (
        v_client_app_version_parts[1]::integer,
        v_client_app_version_parts[2]::integer,
        v_client_app_version_parts[3]::integer
      ) >= (0, 1, 15);
  END IF;

  IF v_normalized_code !~ '^[A-Z0-9]{4,8}$' THEN
    PERFORM public.record_fursuit_code_change_attempt(
      p_fursuit_id,
      v_fursuit_owner_id,
      v_viewer_id,
      v_previous_normalized_code,
      v_normalized_code,
      'code_invalid',
      NULL,
      v_client_attempt_id,
      v_client_app_version,
      v_client_platform,
      jsonb_build_object('source', 'update_fursuit_profile')
    );

    IF v_supports_code_invalid_response THEN
      RETURN jsonb_build_object(
        'status', 'code_invalid',
        'fursuit_id', p_fursuit_id,
        'unique_code', v_previous_normalized_code
      );
    END IF;

    RETURN jsonb_build_object(
      'status', 'code_taken',
      'fursuit_id', p_fursuit_id,
      'unique_code', v_normalized_code
    );
  END IF;

  IF v_code_changed THEN
    IF EXISTS (
      SELECT 1
      FROM public.fursuit_code_change_allowances a
      WHERE a.owner_id = v_viewer_id
        AND a.consumed_fursuit_id = p_fursuit_id
    ) THEN
      PERFORM public.record_fursuit_code_change_attempt(
        p_fursuit_id,
        v_fursuit_owner_id,
        v_viewer_id,
        v_previous_normalized_code,
        v_normalized_code,
        'code_change_locked',
        NULL,
        v_client_attempt_id,
        v_client_app_version,
        v_client_platform,
        jsonb_build_object('source', 'update_fursuit_profile', 'reason', 'fursuit_already_changed')
      );

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
      PERFORM public.record_fursuit_code_change_attempt(
        p_fursuit_id,
        v_fursuit_owner_id,
        v_viewer_id,
        v_previous_normalized_code,
        v_normalized_code,
        'code_change_locked',
        NULL,
        v_client_attempt_id,
        v_client_app_version,
        v_client_platform,
        jsonb_build_object('source', 'update_fursuit_profile', 'reason', 'no_remaining_allowance')
      );

      RETURN jsonb_build_object(
        'status', 'code_change_locked',
        'fursuit_id', p_fursuit_id,
        'unique_code', v_previous_normalized_code
      );
    END IF;
  END IF;

  IF v_code_changed THEN
    SELECT f.id
    INTO v_conflicting_fursuit_id
    FROM public.fursuits f
    WHERE upper(f.unique_code) = v_normalized_code
      AND f.id <> p_fursuit_id
    LIMIT 1;

    IF v_conflicting_fursuit_id IS NOT NULL THEN
      PERFORM public.record_fursuit_code_change_attempt(
        p_fursuit_id,
        v_fursuit_owner_id,
        v_viewer_id,
        v_previous_normalized_code,
        v_normalized_code,
        'code_taken',
        v_conflicting_fursuit_id,
        v_client_attempt_id,
        v_client_app_version,
        v_client_platform,
        jsonb_build_object('source', 'update_fursuit_profile')
      );

      RETURN jsonb_build_object(
        'status', 'code_taken',
        'fursuit_id', p_fursuit_id,
        'unique_code', v_normalized_code
      );
    END IF;
  END IF;

  PERFORM set_config('tailtag.client_attempt_id', coalesce(v_client_attempt_id, ''), true);
  PERFORM set_config('tailtag.client_app_version', coalesce(v_client_app_version, ''), true);
  PERFORM set_config('tailtag.client_platform', coalesce(v_client_platform, ''), true);

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
      SELECT f.id
      INTO v_conflicting_fursuit_id
      FROM public.fursuits f
      WHERE upper(f.unique_code) = v_normalized_code
        AND f.id <> p_fursuit_id
      LIMIT 1;

      PERFORM public.record_fursuit_code_change_attempt(
        p_fursuit_id,
        v_fursuit_owner_id,
        v_viewer_id,
        v_previous_normalized_code,
        v_normalized_code,
        'code_taken',
        v_conflicting_fursuit_id,
        v_client_attempt_id,
        v_client_app_version,
        v_client_platform,
        jsonb_build_object('source', 'update_fursuit_profile', 'reason', 'unique_violation')
      );

      RETURN jsonb_build_object(
        'status', 'code_taken',
        'fursuit_id', p_fursuit_id,
        'unique_code', v_normalized_code
      );
    WHEN raise_exception THEN
      IF SQLERRM = 'fursuit_code_change_locked' THEN
        PERFORM public.record_fursuit_code_change_attempt(
          p_fursuit_id,
          v_fursuit_owner_id,
          v_viewer_id,
          v_previous_normalized_code,
          v_normalized_code,
          'code_change_locked',
          NULL,
          v_client_attempt_id,
          v_client_app_version,
          v_client_platform,
          jsonb_build_object('source', 'update_fursuit_profile', 'reason', 'trigger_locked')
        );

        RETURN jsonb_build_object(
          'status', 'code_change_locked',
          'fursuit_id', p_fursuit_id,
          'unique_code', v_previous_normalized_code
        );
      END IF;

      RAISE;
  END;

  IF v_updated_count = 0 THEN
    PERFORM public.record_fursuit_code_change_attempt(
      p_fursuit_id,
      v_fursuit_owner_id,
      v_viewer_id,
      v_previous_normalized_code,
      v_normalized_code,
      'not_found',
      NULL,
      v_client_attempt_id,
      v_client_app_version,
      v_client_platform,
      jsonb_build_object('source', 'update_fursuit_profile', 'reason', 'zero_rows_updated')
    );

    RETURN jsonb_build_object(
      'status', 'not_found',
      'fursuit_id', p_fursuit_id,
      'unique_code', NULL
    );
  END IF;

  IF v_code_changed THEN
    PERFORM public.record_fursuit_code_change_attempt(
      p_fursuit_id,
      v_fursuit_owner_id,
      v_viewer_id,
      v_previous_normalized_code,
      v_normalized_code,
      'updated',
      NULL,
      v_client_attempt_id,
      v_client_app_version,
      v_client_platform,
      jsonb_build_object('source', 'update_fursuit_profile')
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
  boolean,
  text,
  text,
  text
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
  boolean,
  text,
  text,
  text
)
TO authenticated, service_role;
