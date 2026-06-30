-- Add curated main color options and optional display-only color details.

ALTER TABLE public.fursuits
ADD COLUMN IF NOT EXISTS color_details text;

ALTER TABLE public.fursuits
DROP CONSTRAINT IF EXISTS fursuits_color_details_length_check;

ALTER TABLE public.fursuits
ADD CONSTRAINT fursuits_color_details_length_check
CHECK (color_details IS NULL OR char_length(color_details) <= 200);

INSERT INTO public.fursuit_colors (id, name, is_active)
VALUES
  ('a134b205-b0ea-4721-8521-b59127f62ea4', 'Cream', true),
  ('63232e0d-1f46-4d8e-abcc-a2915e1fdf04', 'Tan', true),
  ('28c91240-cb43-4502-8c81-995dfd82a88f', 'Gold', true),
  ('269bacad-6c2a-4226-ae8b-4a4d21bf8e3e', 'Silver', true),
  ('c71c4c15-1677-4e79-a274-d89c6dc8d682', 'Other', true)
ON CONFLICT (normalized_name) DO UPDATE
SET
  name = EXCLUDED.name,
  is_active = true;

DROP FUNCTION IF EXISTS public.get_fursuit_detail(uuid);
CREATE OR REPLACE FUNCTION public.get_fursuit_detail(p_fursuit_id uuid)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  name text,
  species_id uuid,
  avatar_path text,
  avatar_url text,
  description text,
  color_details text,
  unique_code text,
  visibility_audience text,
  owner_attribution_visibility text,
  social_signal text,
  interaction_badges text[],
  catch_count integer,
  created_at timestamp with time zone,
  species_entry jsonb,
  color_assignments jsonb,
  fursuit_conventions jsonb,
  fursuit_bio jsonb,
  owner_social_links jsonb,
  makers jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH viewer AS (
    SELECT auth.uid() AS id
  ),
  visible_fursuit AS (
    SELECT
      f.*,
      public.can_view_fursuit((SELECT id FROM viewer), f.id) AS can_view_suit,
      public.can_view_fursuit_owner((SELECT id FROM viewer), f.id) AS can_view_owner
    FROM public.fursuits f
    WHERE f.id = p_fursuit_id
      AND (SELECT id FROM viewer) IS NOT NULL
      AND public.can_view_fursuit((SELECT id FROM viewer), f.id)
  )
  SELECT
    f.id,
    CASE WHEN f.can_view_owner THEN f.owner_id ELSE NULL END,
    f.name,
    f.species_id,
    f.avatar_path,
    f.avatar_url,
    f.description,
    f.color_details,
    CASE WHEN f.owner_id = (SELECT id FROM viewer) THEN f.unique_code ELSE NULL END,
    f.visibility_audience,
    f.owner_attribution_visibility,
    f.social_signal,
    coalesce(f.interaction_badges, '{}'::text[]),
    coalesce(f.catch_count, 0),
    f.created_at,
    CASE
      WHEN fs.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', fs.id,
        'name', fs.name,
        'normalized_name', fs.normalized_name
      )
    END,
    coalesce(colors.data, '[]'::jsonb),
    coalesce(conventions.data, '[]'::jsonb),
    CASE
      WHEN bio.data IS NULL THEN NULL
      WHEN f.owner_attribution_visibility = 'hidden'
        THEN app_private.redact_fursuit_bio_social_links(
          CASE
            WHEN f.can_view_owner THEN bio.data
            ELSE bio.data - 'owner_name' || jsonb_build_object('owner_name', NULL)
          END
        )
      WHEN f.can_view_owner THEN bio.data
      ELSE bio.data - 'owner_name' || jsonb_build_object('owner_name', NULL)
    END,
    CASE
      WHEN f.can_view_owner AND f.owner_attribution_visibility <> 'hidden'
        THEN coalesce(owner_profile.social_links, '[]'::jsonb)
      ELSE '[]'::jsonb
    END,
    coalesce(makers.data, '[]'::jsonb)
  FROM visible_fursuit f
  LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
  LEFT JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'position', fca.position,
        'color', jsonb_build_object(
          'id', fc.id,
          'name', fc.name,
          'normalized_name', fc.normalized_name
        )
      )
      ORDER BY fca.position ASC, fc.name ASC
    ) AS data
    FROM public.fursuit_color_assignments fca
    JOIN public.fursuit_colors fc ON fc.id = fca.color_id
    WHERE fca.fursuit_id = f.id
  ) colors ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'roster_visible', fc.roster_visible,
        'roster_state', fc.roster_state,
        'active_until', fc.active_until,
        'convention', jsonb_build_object(
          'id', c.id,
          'slug', c.slug,
          'name', c.name,
          'location', c.location,
          'start_date', c.start_date,
          'end_date', c.end_date,
          'timezone', c.timezone,
          'status', c.status,
          'finalizing_started_at', c.finalizing_started_at,
          'closeout_not_before', c.closeout_not_before,
          'latitude', c.latitude,
          'longitude', c.longitude,
          'geofence_radius_meters', c.geofence_radius_meters,
          'geofence_enabled', c.geofence_enabled,
          'location_verification_required', c.location_verification_required
        )
      )
      ORDER BY c.start_date DESC NULLS LAST, c.name ASC
    ) AS data
    FROM public.fursuit_conventions fc
    JOIN public.conventions c ON c.id = fc.convention_id
    WHERE fc.fursuit_id = f.id
  ) conventions ON true
  LEFT JOIN LATERAL (
    SELECT to_jsonb(fb.*) AS data
    FROM public.fursuit_bios fb
    WHERE fb.fursuit_id = f.id
    ORDER BY fb.version DESC
    LIMIT 1
  ) bio ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', fm.id,
        'maker_name', fm.maker_name,
        'normalized_maker_name', fm.normalized_maker_name,
        'position', fm.position
      )
      ORDER BY fm.position
    ) AS data
    FROM public.fursuit_makers fm
    WHERE fm.fursuit_id = f.id
  ) makers ON true;
$function$;

REVOKE ALL ON FUNCTION public.get_fursuit_detail(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_fursuit_detail(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_profile_fursuits(uuid);
CREATE OR REPLACE FUNCTION public.get_profile_fursuits(p_profile_id uuid)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  name text,
  species_id uuid,
  avatar_path text,
  avatar_url text,
  description text,
  color_details text,
  visibility_audience text,
  owner_attribution_visibility text,
  social_signal text,
  interaction_badges text[],
  catch_count integer,
  created_at timestamp with time zone,
  display_order integer,
  species_entry jsonb,
  color_assignments jsonb,
  fursuit_conventions jsonb,
  fursuit_bio jsonb,
  owner_social_links jsonb,
  makers jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH viewer AS (
    SELECT auth.uid() AS id
  ),
  visible_fursuits AS (
    SELECT
      f.*,
      public.can_view_fursuit_owner((SELECT id FROM viewer), f.id) AS can_view_owner
    FROM public.fursuits f
    WHERE f.owner_id = p_profile_id
      AND (SELECT id FROM viewer) IS NOT NULL
      AND public.can_view_fursuit((SELECT id FROM viewer), f.id)
      AND public.can_view_fursuit_owner((SELECT id FROM viewer), f.id)
  )
  SELECT
    f.id,
    f.owner_id,
    f.name,
    f.species_id,
    f.avatar_path,
    f.avatar_url,
    f.description,
    f.color_details,
    f.visibility_audience,
    f.owner_attribution_visibility,
    f.social_signal,
    coalesce(f.interaction_badges, '{}'::text[]),
    coalesce(f.catch_count, 0),
    f.created_at,
    f.display_order,
    CASE
      WHEN fs.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', fs.id,
        'name', fs.name,
        'normalized_name', fs.normalized_name
      )
    END,
    coalesce(colors.data, '[]'::jsonb),
    coalesce(conventions.data, '[]'::jsonb),
    CASE
      WHEN bio.data IS NULL THEN NULL
      WHEN f.can_view_owner THEN bio.data
      ELSE bio.data - 'owner_name' || jsonb_build_object('owner_name', NULL)
    END,
    CASE WHEN f.can_view_owner THEN coalesce(owner_profile.social_links, '[]'::jsonb) ELSE '[]'::jsonb END,
    coalesce(makers.data, '[]'::jsonb)
  FROM visible_fursuits f
  LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
  LEFT JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'position', fca.position,
        'color', jsonb_build_object(
          'id', fc.id,
          'name', fc.name,
          'normalized_name', fc.normalized_name
        )
      )
      ORDER BY fca.position ASC, fc.name ASC
    ) AS data
    FROM public.fursuit_color_assignments fca
    JOIN public.fursuit_colors fc ON fc.id = fca.color_id
    WHERE fca.fursuit_id = f.id
  ) colors ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'roster_visible', fc.roster_visible,
        'roster_state', fc.roster_state,
        'active_until', fc.active_until,
        'convention', jsonb_build_object(
          'id', c.id,
          'slug', c.slug,
          'name', c.name,
          'location', c.location,
          'start_date', c.start_date,
          'end_date', c.end_date,
          'timezone', c.timezone,
          'status', c.status,
          'finalizing_started_at', c.finalizing_started_at,
          'closeout_not_before', c.closeout_not_before,
          'latitude', c.latitude,
          'longitude', c.longitude,
          'geofence_radius_meters', c.geofence_radius_meters,
          'geofence_enabled', c.geofence_enabled,
          'location_verification_required', c.location_verification_required
        )
      )
      ORDER BY c.start_date DESC NULLS LAST, c.name ASC
    ) AS data
    FROM public.fursuit_conventions fc
    JOIN public.conventions c ON c.id = fc.convention_id
    WHERE fc.fursuit_id = f.id
  ) conventions ON true
  LEFT JOIN LATERAL (
    SELECT to_jsonb(fb.*) AS data
    FROM public.fursuit_bios fb
    WHERE fb.fursuit_id = f.id
    ORDER BY fb.version DESC
    LIMIT 1
  ) bio ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', fm.id,
        'maker_name', fm.maker_name,
        'normalized_maker_name', fm.normalized_maker_name,
        'position', fm.position
      )
      ORDER BY fm.position
    ) AS data
    FROM public.fursuit_makers fm
    WHERE fm.fursuit_id = f.id
  ) makers ON true
  ORDER BY f.display_order ASC NULLS LAST, f.created_at DESC NULLS LAST, f.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_profile_fursuits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_fursuits(uuid) TO authenticated;

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
