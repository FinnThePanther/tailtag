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
      WHEN c.can_view_owner THEN bio.data
      ELSE bio.data - 'owner_name' || jsonb_build_object('owner_name', NULL)
    END,
    CASE
      WHEN c.can_view_fursuit AND c.can_view_owner THEN coalesce(owner_profile.social_links, '[]'::jsonb)
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
      WHEN c.can_view_owner THEN bio.data
      ELSE bio.data - 'owner_name' || jsonb_build_object('owner_name', NULL)
    END AS fursuit_bio,
    CASE
      WHEN c.can_view_fursuit AND c.can_view_owner THEN coalesce(owner_profile.social_links, '[]'::jsonb)
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
