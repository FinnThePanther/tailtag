-- Preserve color_details when older clients call update_fursuit_profile without the new parameter.

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
  boolean,
  text,
  text,
  text,
  text
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
  p_client_platform text DEFAULT NULL,
  p_color_details text DEFAULT NULL,
  p_preserve_color_details boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_normalized_code text := upper(btrim(coalesce(p_unique_code, '')));
  v_preserve_color_details boolean := p_preserve_color_details IS TRUE AND p_color_details IS NULL;
  v_color_details text := NULLIF(left(btrim(coalesce(p_color_details, '')), 200), '');
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
      color_details = CASE
        WHEN v_preserve_color_details THEN color_details
        ELSE v_color_details
      END,
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
  boolean,
  text,
  text,
  text,
  text,
  boolean
)
TO authenticated;

NOTIFY pgrst, 'reload schema';
