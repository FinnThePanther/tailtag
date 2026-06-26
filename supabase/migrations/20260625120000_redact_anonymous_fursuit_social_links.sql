CREATE OR REPLACE FUNCTION app_private.redact_fursuit_bio_social_links(p_bio jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_bio IS NULL THEN NULL
    WHEN jsonb_typeof(p_bio) = 'array' THEN (
      SELECT jsonb_agg(
        CASE
          WHEN jsonb_typeof(entry.value) = 'object'
            THEN entry.value || jsonb_build_object('social_links', '[]'::jsonb)
          ELSE entry.value
        END
        ORDER BY entry.ordinality
      )
      FROM jsonb_array_elements(p_bio) WITH ORDINALITY AS entry(value, ordinality)
    )
    WHEN jsonb_typeof(p_bio) = 'object'
      THEN p_bio || jsonb_build_object('social_links', '[]'::jsonb)
    ELSE p_bio
  END;
$function$;

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

DROP FUNCTION IF EXISTS public.get_catch_detail(uuid);
CREATE OR REPLACE FUNCTION public.get_catch_detail(p_catch_id uuid)
RETURNS TABLE(
  catch_id uuid,
  caught_at timestamp with time zone,
  convention_id uuid,
  catch_number integer,
  catch_photo_path text,
  catch_photo_url text,
  convention jsonb,
  fursuit_id uuid,
  fursuit_redacted boolean,
  fursuit_owner_id uuid,
  fursuit_name text,
  species_id uuid,
  species_name text,
  fursuit_avatar_path text,
  fursuit_avatar_url text,
  fursuit_description text,
  fursuit_unique_code text,
  fursuit_visibility_audience text,
  fursuit_social_signal text,
  fursuit_interaction_badges text[],
  fursuit_owner_attribution_visibility text,
  fursuit_catch_count integer,
  fursuit_created_at timestamp with time zone,
  color_assignments jsonb,
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
  visible_catches AS (
    SELECT
      c.*,
      public.can_view_fursuit_as_profile((SELECT id FROM viewer), c.fursuit_id) AS can_view_fursuit,
      public.can_view_fursuit_owner((SELECT id FROM viewer), c.fursuit_id) AS can_view_owner
    FROM public.catches c
    JOIN public.fursuits f ON f.id = c.fursuit_id
    WHERE c.id = p_catch_id
      AND c.status = 'ACCEPTED'
      AND (
        c.catcher_id = (SELECT id FROM viewer)
        OR f.owner_id = (SELECT id FROM viewer)
        OR public.is_elevated_privacy_viewer((SELECT id FROM viewer))
      )
  )
  SELECT
    c.id,
    c.caught_at,
    c.convention_id,
    c.catch_number,
    CASE WHEN c.can_view_fursuit THEN c.catch_photo_path ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN c.catch_photo_url ELSE NULL END,
    CASE
      WHEN conv.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', conv.id,
        'name', conv.name,
        'location', conv.location,
        'start_date', conv.start_date,
        'end_date', conv.end_date,
        'status', conv.status
      )
    END,
    c.fursuit_id,
    NOT c.can_view_fursuit,
    CASE WHEN c.can_view_fursuit AND c.can_view_owner THEN f.owner_id ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN f.name ELSE 'Unavailable fursuit' END,
    CASE WHEN c.can_view_fursuit THEN f.species_id ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN fs.name ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN f.avatar_path ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN f.avatar_url ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN f.description ELSE NULL END,
    CASE
      WHEN c.can_view_fursuit AND f.owner_id = (SELECT id FROM viewer) THEN f.unique_code
      ELSE NULL
    END,
    CASE WHEN c.can_view_fursuit THEN f.visibility_audience ELSE 'everyone' END,
    CASE WHEN c.can_view_fursuit THEN f.social_signal ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN coalesce(f.interaction_badges, '{}'::text[]) ELSE '{}'::text[] END,
    CASE WHEN c.can_view_fursuit THEN f.owner_attribution_visibility ELSE 'public' END,
    CASE WHEN c.can_view_fursuit THEN coalesce(f.catch_count, 0) ELSE 0 END,
    CASE WHEN c.can_view_fursuit THEN f.created_at ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN coalesce(colors.data, '[]'::jsonb) ELSE '[]'::jsonb END,
    CASE
      WHEN NOT c.can_view_fursuit OR bio.data IS NULL THEN NULL
      WHEN f.owner_attribution_visibility = 'hidden'
        THEN app_private.redact_fursuit_bio_social_links(
          CASE
            WHEN c.can_view_owner THEN bio.data
            ELSE bio.data - 'owner_name' || jsonb_build_object('owner_name', NULL)
          END
        )
      WHEN c.can_view_owner THEN bio.data
      ELSE bio.data - 'owner_name' || jsonb_build_object('owner_name', NULL)
    END,
    CASE
      WHEN c.can_view_fursuit
       AND c.can_view_owner
       AND f.owner_attribution_visibility <> 'hidden'
        THEN coalesce(owner_profile.social_links, '[]'::jsonb)
      ELSE '[]'::jsonb
    END,
    CASE WHEN c.can_view_fursuit THEN coalesce(makers.data, '[]'::jsonb) ELSE '[]'::jsonb END
  FROM visible_catches c
  LEFT JOIN public.fursuits f ON f.id = c.fursuit_id
  LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
  LEFT JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
  LEFT JOIN public.conventions conv ON conv.id = c.convention_id
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
      ORDER BY fca.position
    ) AS data
    FROM public.fursuit_color_assignments fca
    JOIN public.fursuit_colors fc ON fc.id = fca.color_id
    WHERE fca.fursuit_id = f.id
  ) colors ON TRUE
  LEFT JOIN LATERAL (
    SELECT to_jsonb(fb.*) AS data
    FROM public.fursuit_bios fb
    WHERE fb.fursuit_id = f.id
    ORDER BY fb.version DESC
    LIMIT 1
  ) bio ON TRUE
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
  ) makers ON TRUE;
$function$;

DROP FUNCTION IF EXISTS public.get_my_caught_suits();
CREATE OR REPLACE FUNCTION public.get_my_caught_suits()
RETURNS TABLE(
  catch_id uuid,
  caught_at timestamp with time zone,
  convention_id uuid,
  catch_number integer,
  catch_photo_path text,
  catch_photo_url text,
  convention jsonb,
  fursuit_id uuid,
  fursuit_redacted boolean,
  fursuit_owner_id uuid,
  fursuit_name text,
  species_id uuid,
  species_name text,
  fursuit_avatar_path text,
  fursuit_avatar_url text,
  fursuit_description text,
  fursuit_unique_code text,
  fursuit_visibility_audience text,
  fursuit_social_signal text,
  fursuit_interaction_badges text[],
  fursuit_owner_attribution_visibility text,
  fursuit_catch_count integer,
  fursuit_created_at timestamp with time zone,
  color_assignments jsonb,
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
  visible_catches AS (
    SELECT
      c.*,
      public.can_view_fursuit_as_profile((SELECT id FROM viewer), c.fursuit_id) AS can_view_fursuit,
      public.can_view_fursuit_owner((SELECT id FROM viewer), c.fursuit_id) AS can_view_owner
    FROM public.catches c
    WHERE c.catcher_id = (SELECT id FROM viewer)
      AND c.status = 'ACCEPTED'
  )
  SELECT
    c.id AS catch_id,
    c.caught_at,
    c.convention_id,
    c.catch_number,
    CASE WHEN c.can_view_fursuit THEN c.catch_photo_path ELSE NULL END AS catch_photo_path,
    CASE WHEN c.can_view_fursuit THEN c.catch_photo_url ELSE NULL END AS catch_photo_url,
    CASE
      WHEN conv.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', conv.id,
        'name', conv.name,
        'location', conv.location,
        'start_date', conv.start_date,
        'end_date', conv.end_date,
        'status', conv.status
      )
    END AS convention,
    c.fursuit_id,
    NOT c.can_view_fursuit AS fursuit_redacted,
    CASE WHEN c.can_view_fursuit AND c.can_view_owner THEN f.owner_id ELSE NULL END AS fursuit_owner_id,
    CASE WHEN c.can_view_fursuit THEN f.name ELSE 'Unavailable fursuit' END AS fursuit_name,
    CASE WHEN c.can_view_fursuit THEN f.species_id ELSE NULL END AS species_id,
    CASE WHEN c.can_view_fursuit THEN fs.name ELSE NULL END AS species_name,
    CASE WHEN c.can_view_fursuit THEN f.avatar_path ELSE NULL END AS fursuit_avatar_path,
    CASE WHEN c.can_view_fursuit THEN f.avatar_url ELSE NULL END AS fursuit_avatar_url,
    CASE WHEN c.can_view_fursuit THEN f.description ELSE NULL END AS fursuit_description,
    CASE
      WHEN c.can_view_fursuit AND f.owner_id = (SELECT id FROM viewer) THEN f.unique_code
      ELSE NULL
    END AS fursuit_unique_code,
    CASE WHEN c.can_view_fursuit THEN f.visibility_audience ELSE 'everyone' END AS fursuit_visibility_audience,
    CASE WHEN c.can_view_fursuit THEN f.social_signal ELSE NULL END AS fursuit_social_signal,
    CASE WHEN c.can_view_fursuit THEN coalesce(f.interaction_badges, '{}'::text[]) ELSE '{}'::text[] END AS fursuit_interaction_badges,
    CASE WHEN c.can_view_fursuit THEN f.owner_attribution_visibility ELSE 'public' END AS fursuit_owner_attribution_visibility,
    CASE WHEN c.can_view_fursuit THEN coalesce(f.catch_count, 0) ELSE 0 END AS fursuit_catch_count,
    CASE WHEN c.can_view_fursuit THEN f.created_at ELSE NULL END AS fursuit_created_at,
    CASE
      WHEN c.can_view_fursuit THEN coalesce(colors.data, '[]'::jsonb)
      ELSE '[]'::jsonb
    END AS color_assignments,
    CASE
      WHEN NOT c.can_view_fursuit OR bio.data IS NULL THEN NULL
      WHEN f.owner_attribution_visibility = 'hidden'
        THEN app_private.redact_fursuit_bio_social_links(
          CASE
            WHEN c.can_view_owner THEN bio.data
            ELSE bio.data - 'owner_name' || jsonb_build_object('owner_name', NULL)
          END
        )
      WHEN c.can_view_owner THEN bio.data
      ELSE bio.data - 'owner_name' || jsonb_build_object('owner_name', NULL)
    END AS fursuit_bio,
    CASE
      WHEN c.can_view_fursuit
       AND c.can_view_owner
       AND f.owner_attribution_visibility <> 'hidden'
        THEN coalesce(owner_profile.social_links, '[]'::jsonb)
      ELSE '[]'::jsonb
    END AS owner_social_links,
    CASE
      WHEN c.can_view_fursuit THEN coalesce(makers.data, '[]'::jsonb)
      ELSE '[]'::jsonb
    END AS makers
  FROM visible_catches c
  LEFT JOIN public.fursuits f ON f.id = c.fursuit_id
  LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
  LEFT JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
  LEFT JOIN public.conventions conv ON conv.id = c.convention_id
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
      ORDER BY fca.position
    ) AS data
    FROM public.fursuit_color_assignments fca
    JOIN public.fursuit_colors fc ON fc.id = fca.color_id
    WHERE fca.fursuit_id = f.id
  ) colors ON TRUE
  LEFT JOIN LATERAL (
    SELECT to_jsonb(fb.*) AS data
    FROM public.fursuit_bios fb
    WHERE fb.fursuit_id = f.id
    ORDER BY fb.version DESC
    LIMIT 1
  ) bio ON TRUE
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
  ) makers ON TRUE
  ORDER BY c.caught_at DESC NULLS LAST, c.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_catch_detail(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_caught_suits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_catch_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_caught_suits() TO authenticated;
