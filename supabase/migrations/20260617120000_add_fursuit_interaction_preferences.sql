ALTER TABLE public.fursuits
  ADD COLUMN IF NOT EXISTS social_signal text,
  ADD COLUMN IF NOT EXISTS interaction_badges text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.fursuits
  DROP CONSTRAINT IF EXISTS fursuits_social_signal_check,
  ADD CONSTRAINT fursuits_social_signal_check
  CHECK (
    social_signal IS NULL
    OR social_signal = ANY (ARRAY[
      'open_to_interaction',
      'ask_first',
      'not_social_right_now'
    ])
  );

ALTER TABLE public.fursuits
  DROP CONSTRAINT IF EXISTS fursuits_interaction_badges_allowed_check,
  ADD CONSTRAINT fursuits_interaction_badges_allowed_check
  CHECK (
    interaction_badges <@ ARRAY[
      'ask_before_touching',
      'no_touching',
      'ask_before_hugs',
      'no_hugs',
      'photos_ok',
      'ask_before_photos',
      'silent_suiter',
      'hard_of_hearing',
      'low_visibility',
      'please_be_patient',
      'needs_space',
      'prone_to_overheating',
      'sensory_sensitive',
      'please_say_hi',
      'awkward_but_friendly',
      'socially_anxious'
    ]::text[]
  );

ALTER TABLE public.fursuits
  DROP CONSTRAINT IF EXISTS fursuits_interaction_badges_max_check,
  ADD CONSTRAINT fursuits_interaction_badges_max_check
  CHECK (cardinality(interaction_badges) <= 6);

CREATE OR REPLACE FUNCTION public.text_array_has_no_duplicates(input_values text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT cardinality(input_values) = (
    SELECT count(DISTINCT value)::integer
    FROM unnest(input_values) AS value
  );
$function$;

ALTER TABLE public.fursuits
  DROP CONSTRAINT IF EXISTS fursuits_interaction_badges_no_duplicates_check,
  ADD CONSTRAINT fursuits_interaction_badges_no_duplicates_check
  CHECK (public.text_array_has_no_duplicates(interaction_badges));

ALTER TABLE public.fursuits
  DROP CONSTRAINT IF EXISTS fursuits_interaction_badges_exclusive_check,
  ADD CONSTRAINT fursuits_interaction_badges_exclusive_check
  CHECK (
    NOT (interaction_badges @> ARRAY['ask_before_touching', 'no_touching']::text[])
    AND NOT (interaction_badges @> ARRAY['ask_before_hugs', 'no_hugs']::text[])
    AND NOT (interaction_badges @> ARRAY['photos_ok', 'ask_before_photos']::text[])
  );

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
      WHEN f.can_view_owner THEN bio.data
      ELSE bio.data - 'owner_name' || jsonb_build_object('owner_name', NULL)
    END,
    CASE WHEN f.can_view_owner THEN coalesce(owner_profile.social_links, '[]'::jsonb) ELSE '[]'::jsonb END,
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
  ORDER BY f.created_at DESC NULLS LAST, f.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_profile_fursuits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_fursuits(uuid) TO authenticated;
