-- Redact adult-boundary metadata from historical catch and recap surfaces while
-- preserving records, counts, and timestamps.

CREATE OR REPLACE FUNCTION public.can_view_profile_as_profile(
  p_viewer_id uuid,
  p_target_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles target_profile
    JOIN public.profiles viewer_profile ON viewer_profile.id = p_viewer_id
    WHERE target_profile.id = p_target_id
      AND (
        p_viewer_id = p_target_id
        OR viewer_profile.role IN ('owner', 'moderator')
        OR target_profile.visibility_audience = 'everyone'
        OR (
          target_profile.visibility_audience = 'adults_only'
          AND coalesce(viewer_profile.is_adult, false) = true
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_view_fursuit_as_profile(
  p_viewer_id uuid,
  p_fursuit_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.fursuits f
    JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
    JOIN public.profiles viewer_profile ON viewer_profile.id = p_viewer_id
    WHERE f.id = p_fursuit_id
      AND (
        p_viewer_id = f.owner_id
        OR viewer_profile.role IN ('owner', 'moderator')
        OR (
          owner_profile.visibility_audience = 'everyone'
          AND f.visibility_audience = 'everyone'
        )
        OR (
          (
            owner_profile.visibility_audience = 'adults_only'
            OR f.visibility_audience = 'adults_only'
          )
          AND coalesce(viewer_profile.is_adult, false) = true
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.can_view_profile_as_profile(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_fursuit_as_profile(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile_as_profile(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_fursuit_as_profile(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_caught_suits()
RETURNS TABLE (
  catch_id uuid,
  caught_at timestamptz,
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
  fursuit_catch_count integer,
  fursuit_created_at timestamptz,
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
      public.can_view_fursuit_as_profile((SELECT id FROM viewer), c.fursuit_id) AS can_view_fursuit
    FROM public.catches c
    WHERE c.catcher_id = (SELECT id FROM viewer)
      AND c.status = 'ACCEPTED'
      AND c.is_tutorial = false
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
    CASE WHEN c.can_view_fursuit THEN f.owner_id ELSE NULL END AS fursuit_owner_id,
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
    CASE WHEN c.can_view_fursuit THEN coalesce(f.catch_count, 0) ELSE 0 END AS fursuit_catch_count,
    CASE WHEN c.can_view_fursuit THEN f.created_at ELSE NULL END AS fursuit_created_at,
    CASE
      WHEN c.can_view_fursuit THEN coalesce(colors.data, '[]'::jsonb)
      ELSE '[]'::jsonb
    END AS color_assignments,
    CASE WHEN c.can_view_fursuit THEN bio.data ELSE NULL END AS fursuit_bio,
    CASE
      WHEN c.can_view_fursuit THEN coalesce(owner_profile.social_links, '[]'::jsonb)
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
  ) colors ON true
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
  ORDER BY c.caught_at DESC NULLS LAST, c.id DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_catch_detail(p_catch_id uuid)
RETURNS TABLE (
  catch_id uuid,
  caught_at timestamptz,
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
  fursuit_catch_count integer,
  fursuit_created_at timestamptz,
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
      public.can_view_fursuit_as_profile((SELECT id FROM viewer), c.fursuit_id) AS can_view_fursuit
    FROM public.catches c
    JOIN public.fursuits f ON f.id = c.fursuit_id
    WHERE c.id = p_catch_id
      AND c.status = 'ACCEPTED'
      AND c.is_tutorial = false
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
    CASE WHEN c.can_view_fursuit THEN f.owner_id ELSE NULL END,
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
    CASE WHEN c.can_view_fursuit THEN coalesce(f.catch_count, 0) ELSE 0 END,
    CASE WHEN c.can_view_fursuit THEN f.created_at ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN coalesce(colors.data, '[]'::jsonb) ELSE '[]'::jsonb END,
    CASE WHEN c.can_view_fursuit THEN bio.data ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN coalesce(owner_profile.social_links, '[]'::jsonb) ELSE '[]'::jsonb END,
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
  ) colors ON true
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

CREATE OR REPLACE FUNCTION public.get_fursuit_catches(p_fursuit_id uuid)
RETURNS TABLE (
  catch_id uuid,
  caught_at timestamptz,
  catch_photo_path text,
  catch_photo_url text,
  is_redacted boolean
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
      public.can_view_profile_as_profile((SELECT id FROM viewer), c.catcher_id) AS can_view_catcher
    FROM public.catches c
    WHERE c.fursuit_id = p_fursuit_id
      AND c.status = 'ACCEPTED'
      AND c.is_tutorial = false
  )
  SELECT
    c.id,
    c.caught_at,
    CASE
      WHEN c.can_view_fursuit AND c.can_view_catcher
        THEN c.catch_photo_path
      ELSE NULL
    END AS catch_photo_path,
    CASE
      WHEN c.can_view_fursuit AND c.can_view_catcher
        THEN c.catch_photo_url
      ELSE NULL
    END AS catch_photo_url,
    NOT (c.can_view_fursuit AND c.can_view_catcher) AS is_redacted
  FROM visible_catches c
  WHERE c.can_view_fursuit
  ORDER BY c.caught_at DESC NULLS LAST, c.id DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_convention_recap_detail(p_recap_id uuid)
RETURNS TABLE (
  recap jsonb,
  caught_fursuits jsonb,
  owned_fursuits jsonb,
  achievements jsonb,
  daily_summary jsonb,
  awards jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH recap_row AS (
    SELECT
      r.id AS recap_id,
      r.convention_id,
      r.profile_id,
      c.name AS convention_name,
      c.location,
      c.start_date,
      c.end_date,
      r.generated_at,
      r.joined_at,
      r.left_at,
      r.final_rank,
      r.catch_count,
      r.unique_fursuits_caught_count,
      r.own_fursuits_caught_count,
      r.unique_catchers_for_own_fursuits_count,
      r.daily_tasks_completed_count,
      r.achievements_unlocked_count,
      r.summary
    FROM public.convention_participant_recaps r
    JOIN public.conventions c ON c.id = r.convention_id
    WHERE r.id = p_recap_id
      AND r.profile_id = (SELECT auth.uid())
      AND c.status = 'archived'
    LIMIT 1
  ),
  recap_payload AS (
    SELECT jsonb_build_object(
      'recap_id', rr.recap_id,
      'convention_id', rr.convention_id,
      'convention_name', rr.convention_name,
      'location', rr.location,
      'start_date', rr.start_date,
      'end_date', rr.end_date,
      'generated_at', rr.generated_at,
      'joined_at', rr.joined_at,
      'left_at', rr.left_at,
      'final_rank', rr.final_rank,
      'catch_count', rr.catch_count,
      'unique_fursuits_caught_count', rr.unique_fursuits_caught_count,
      'own_fursuits_caught_count', rr.own_fursuits_caught_count,
      'unique_catchers_for_own_fursuits_count', rr.unique_catchers_for_own_fursuits_count,
      'daily_tasks_completed_count', rr.daily_tasks_completed_count,
      'achievements_unlocked_count', rr.achievements_unlocked_count
    ) AS data
    FROM recap_row rr
  ),
  live_caught AS (
    SELECT
      c.fursuit_id,
      COUNT(*)::integer AS catch_count,
      MIN(c.caught_at) AS first_caught_at,
      MAX(c.caught_at) AS most_recent_caught_at
    FROM recap_row rr
    JOIN public.catches c
      ON c.convention_id = rr.convention_id
      AND c.catcher_id = rr.profile_id
    WHERE c.status = 'ACCEPTED'
      AND c.is_tutorial = false
    GROUP BY c.fursuit_id
  ),
  snapshot_caught_raw AS (
    SELECT
      CASE
        WHEN entry ? 'fursuit_id'
          AND COALESCE(entry ->> 'fursuit_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (entry ->> 'fursuit_id')::uuid
        ELSE NULL
      END AS fursuit_id,
      NULLIF(TRIM(entry ->> 'name'), '') AS name,
      CASE
        WHEN COALESCE(entry ->> 'catch_count', '') ~ '^[0-9]+$'
          THEN (entry ->> 'catch_count')::integer
        ELSE 0
      END AS catch_count
    FROM recap_row rr
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(rr.summary -> 'fursuits_caught') = 'array'
          THEN rr.summary -> 'fursuits_caught'
        ELSE '[]'::jsonb
      END
    ) AS entry
  ),
  caught_candidates AS (
    SELECT
      lc.fursuit_id,
      lc.catch_count,
      lc.first_caught_at,
      lc.most_recent_caught_at,
      f.name,
      f.avatar_url,
      fs.name AS species,
      COALESCE(colors.color_names, '[]'::jsonb) AS colors,
      f.owner_id,
      owner_profile.username AS owner_username,
      fb.owner_name,
      fb.pronouns,
      fb.ask_me_about,
      fb.likes_and_interests,
      COALESCE(fb.social_links, '[]'::jsonb) AS social_links,
      public.can_view_fursuit_as_profile((SELECT profile_id FROM recap_row), lc.fursuit_id) AS can_view_fursuit,
      0 AS source_priority
    FROM live_caught lc
    LEFT JOIN public.fursuits f ON f.id = lc.fursuit_id
    LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
    LEFT JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
    LEFT JOIN LATERAL (
      SELECT *
      FROM public.fursuit_bios
      WHERE fursuit_id = f.id
      ORDER BY version DESC
      LIMIT 1
    ) fb ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(fc.name ORDER BY fca.position) AS color_names
      FROM public.fursuit_color_assignments fca
      JOIN public.fursuit_colors fc ON fc.id = fca.color_id
      WHERE fca.fursuit_id = f.id
    ) colors ON true

    UNION ALL

    SELECT
      scr.fursuit_id,
      scr.catch_count,
      NULL::timestamp with time zone AS first_caught_at,
      NULL::timestamp with time zone AS most_recent_caught_at,
      COALESCE(scr.name, f.name) AS name,
      f.avatar_url,
      fs.name AS species,
      COALESCE(colors.color_names, '[]'::jsonb) AS colors,
      f.owner_id,
      owner_profile.username AS owner_username,
      fb.owner_name,
      fb.pronouns,
      fb.ask_me_about,
      fb.likes_and_interests,
      COALESCE(fb.social_links, '[]'::jsonb) AS social_links,
      public.can_view_fursuit_as_profile((SELECT profile_id FROM recap_row), scr.fursuit_id) AS can_view_fursuit,
      1 AS source_priority
    FROM snapshot_caught_raw scr
    LEFT JOIN public.fursuits f ON f.id = scr.fursuit_id
    LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
    LEFT JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
    LEFT JOIN LATERAL (
      SELECT *
      FROM public.fursuit_bios
      WHERE fursuit_id = f.id
      ORDER BY version DESC
      LIMIT 1
    ) fb ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(fc.name ORDER BY fca.position) AS color_names
      FROM public.fursuit_color_assignments fca
      JOIN public.fursuit_colors fc ON fc.id = fca.color_id
      WHERE fca.fursuit_id = f.id
    ) colors ON true
    WHERE scr.fursuit_id IS NOT NULL
  ),
  caught_ranked AS (
    SELECT
      cc.*,
      ROW_NUMBER() OVER (
        PARTITION BY cc.fursuit_id
        ORDER BY cc.source_priority ASC, cc.catch_count DESC, COALESCE(LOWER(cc.name), '') ASC
      ) AS rn
    FROM caught_candidates cc
  ),
  caught_payload AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'fursuit_id', cr.fursuit_id,
          'is_redacted', NOT cr.can_view_fursuit,
          'name', CASE WHEN cr.can_view_fursuit THEN cr.name ELSE 'Unavailable fursuit' END,
          'catch_count', cr.catch_count,
          'first_caught_at', cr.first_caught_at,
          'most_recent_caught_at', cr.most_recent_caught_at,
          'avatar_url', CASE WHEN cr.can_view_fursuit THEN cr.avatar_url ELSE NULL END,
          'species', CASE WHEN cr.can_view_fursuit THEN cr.species ELSE NULL END,
          'colors', CASE WHEN cr.can_view_fursuit THEN cr.colors ELSE '[]'::jsonb END,
          'owner_id', CASE WHEN cr.can_view_fursuit THEN cr.owner_id ELSE NULL END,
          'owner_username', CASE WHEN cr.can_view_fursuit THEN cr.owner_username ELSE NULL END,
          'owner_name', CASE WHEN cr.can_view_fursuit THEN cr.owner_name ELSE NULL END,
          'pronouns', CASE WHEN cr.can_view_fursuit THEN cr.pronouns ELSE NULL END,
          'ask_me_about', CASE WHEN cr.can_view_fursuit THEN cr.ask_me_about ELSE NULL END,
          'likes_and_interests', CASE WHEN cr.can_view_fursuit THEN cr.likes_and_interests ELSE NULL END,
          'social_links', CASE WHEN cr.can_view_fursuit THEN cr.social_links ELSE '[]'::jsonb END
        )
        ORDER BY cr.catch_count DESC, COALESCE(LOWER(CASE WHEN cr.can_view_fursuit THEN cr.name ELSE 'Unavailable fursuit' END), '') ASC
      ),
      '[]'::jsonb
    ) AS data
    FROM caught_ranked cr
    WHERE cr.rn = 1
  ),
  live_owned AS (
    SELECT
      c.fursuit_id,
      COUNT(*)::integer AS times_caught,
      COUNT(DISTINCT c.catcher_id)::integer AS unique_catchers,
      MIN(c.caught_at) AS first_caught_at,
      MAX(c.caught_at) AS most_recent_caught_at
    FROM recap_row rr
    JOIN public.catches c ON c.convention_id = rr.convention_id
    JOIN public.fursuits f ON f.id = c.fursuit_id
    WHERE c.status = 'ACCEPTED'
      AND c.is_tutorial = false
      AND f.owner_id = rr.profile_id
    GROUP BY c.fursuit_id
  ),
  snapshot_owned_raw AS (
    SELECT
      CASE
        WHEN entry ? 'fursuit_id'
          AND COALESCE(entry ->> 'fursuit_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (entry ->> 'fursuit_id')::uuid
        ELSE NULL
      END AS fursuit_id,
      NULLIF(TRIM(entry ->> 'name'), '') AS name,
      CASE
        WHEN COALESCE(entry ->> 'times_caught', '') ~ '^[0-9]+$'
          THEN (entry ->> 'times_caught')::integer
        ELSE 0
      END AS times_caught,
      CASE
        WHEN COALESCE(entry ->> 'unique_catchers', '') ~ '^[0-9]+$'
          THEN (entry ->> 'unique_catchers')::integer
        ELSE 0
      END AS unique_catchers
    FROM recap_row rr
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(rr.summary -> 'own_fursuits') = 'array'
          THEN rr.summary -> 'own_fursuits'
        ELSE '[]'::jsonb
      END
    ) AS entry
  ),
  owned_candidates AS (
    SELECT
      lo.fursuit_id,
      lo.times_caught,
      lo.unique_catchers,
      lo.first_caught_at,
      lo.most_recent_caught_at,
      f.name,
      f.avatar_url,
      fs.name AS species,
      COALESCE(colors.color_names, '[]'::jsonb) AS colors,
      0 AS source_priority
    FROM live_owned lo
    LEFT JOIN public.fursuits f ON f.id = lo.fursuit_id
    LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(fc.name ORDER BY fca.position) AS color_names
      FROM public.fursuit_color_assignments fca
      JOIN public.fursuit_colors fc ON fc.id = fca.color_id
      WHERE fca.fursuit_id = f.id
    ) colors ON true

    UNION ALL

    SELECT
      sor.fursuit_id,
      sor.times_caught,
      sor.unique_catchers,
      NULL::timestamp with time zone AS first_caught_at,
      NULL::timestamp with time zone AS most_recent_caught_at,
      COALESCE(sor.name, f.name) AS name,
      f.avatar_url,
      fs.name AS species,
      COALESCE(colors.color_names, '[]'::jsonb) AS colors,
      1 AS source_priority
    FROM snapshot_owned_raw sor
    LEFT JOIN public.fursuits f ON f.id = sor.fursuit_id
    LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(fc.name ORDER BY fca.position) AS color_names
      FROM public.fursuit_color_assignments fca
      JOIN public.fursuit_colors fc ON fc.id = fca.color_id
      WHERE fca.fursuit_id = f.id
    ) colors ON true
    WHERE sor.fursuit_id IS NOT NULL
  ),
  owned_ranked AS (
    SELECT
      oc.*,
      ROW_NUMBER() OVER (
        PARTITION BY oc.fursuit_id
        ORDER BY oc.source_priority ASC, oc.times_caught DESC, COALESCE(LOWER(oc.name), '') ASC
      ) AS rn
    FROM owned_candidates oc
  ),
  owned_payload AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'fursuit_id', ore.fursuit_id,
          'is_redacted', false,
          'name', ore.name,
          'times_caught', ore.times_caught,
          'unique_catchers', ore.unique_catchers,
          'first_caught_at', ore.first_caught_at,
          'most_recent_caught_at', ore.most_recent_caught_at,
          'avatar_url', ore.avatar_url,
          'species', ore.species,
          'colors', ore.colors
        )
        ORDER BY ore.times_caught DESC, COALESCE(LOWER(ore.name), '') ASC
      ),
      '[]'::jsonb
    ) AS data
    FROM owned_ranked ore
    WHERE ore.rn = 1
  ),
  live_achievements AS (
    SELECT
      ua.achievement_id,
      ua.unlocked_at,
      a.key,
      a.name,
      a.description,
      a.category,
      0 AS source_priority
    FROM recap_row rr
    JOIN public.user_achievements ua ON ua.user_id = rr.profile_id
    JOIN public.achievements a
      ON a.id = ua.achievement_id
      AND a.convention_id = rr.convention_id
  ),
  snapshot_achievement_ids AS (
    SELECT DISTINCT
      CASE
        WHEN COALESCE(value, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN value::uuid
        ELSE NULL
      END AS achievement_id
    FROM recap_row rr
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(rr.summary -> 'achievement_ids') = 'array'
          THEN rr.summary -> 'achievement_ids'
        ELSE '[]'::jsonb
      END
    ) AS value
  ),
  snapshot_achievements AS (
    SELECT
      sai.achievement_id,
      NULL::timestamp with time zone AS unlocked_at,
      a.key,
      a.name,
      a.description,
      a.category,
      1 AS source_priority
    FROM snapshot_achievement_ids sai
    JOIN recap_row rr ON true
    LEFT JOIN public.achievements a
      ON a.id = sai.achievement_id
      AND a.convention_id = rr.convention_id
    WHERE sai.achievement_id IS NOT NULL
  ),
  achievement_candidates AS (
    SELECT * FROM live_achievements
    UNION ALL
    SELECT * FROM snapshot_achievements
  ),
  achievement_ranked AS (
    SELECT
      ac.*,
      ROW_NUMBER() OVER (
        PARTITION BY ac.achievement_id
        ORDER BY ac.source_priority ASC, ac.unlocked_at ASC NULLS LAST
      ) AS rn
    FROM achievement_candidates ac
  ),
  achievements_payload AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'achievement_id', ar.achievement_id,
          'key', ar.key,
          'name', ar.name,
          'description', ar.description,
          'category', ar.category,
          'unlocked_at', ar.unlocked_at
        )
        ORDER BY ar.unlocked_at ASC NULLS LAST, COALESCE(LOWER(ar.name), '') ASC
      ),
      '[]'::jsonb
    ) AS data
    FROM achievement_ranked ar
    WHERE ar.rn = 1
  ),
  live_completed_days AS (
    SELECT
      COUNT(*)::integer AS completed_days_count,
      COALESCE(jsonb_agg(day ORDER BY day), '[]'::jsonb) AS completed_days
    FROM (
      SELECT DISTINCT udp.day
      FROM recap_row rr
      JOIN public.user_daily_progress udp
        ON udp.convention_id = rr.convention_id
        AND udp.user_id = rr.profile_id
      WHERE udp.is_completed = true
    ) completed
  ),
  summary_daily_fallback AS (
    SELECT
      CASE
        WHEN jsonb_typeof(rr.summary -> 'daily_task_days_completed') = 'number'
          THEN GREATEST((rr.summary ->> 'daily_task_days_completed')::integer, 0)
        WHEN COALESCE(rr.summary ->> 'daily_task_days_completed', '') ~ '^[0-9]+$'
          THEN GREATEST((rr.summary ->> 'daily_task_days_completed')::integer, 0)
        ELSE 0
      END AS completed_days_count
    FROM recap_row rr
  ),
  daily_summary_payload AS (
    SELECT jsonb_build_object(
      'completed_tasks_count', rr.daily_tasks_completed_count,
      'completed_days_count',
        CASE
          WHEN lcd.completed_days_count > 0 THEN lcd.completed_days_count
          ELSE sdf.completed_days_count
        END,
      'completed_days', lcd.completed_days,
      'convention_total_days',
        CASE
          WHEN rr.start_date IS NOT NULL
            AND rr.end_date IS NOT NULL
            AND rr.end_date >= rr.start_date
            THEN ((rr.end_date - rr.start_date) + 1)::integer
          ELSE NULL
        END
    ) AS data
    FROM recap_row rr
    CROSS JOIN live_completed_days lcd
    CROSS JOIN summary_daily_fallback sdf
  ),
  owned_award_metrics AS (
    SELECT COALESCE(MAX((value ->> 'times_caught')::integer), 0) AS max_owned_times_caught
    FROM owned_payload op
    CROSS JOIN LATERAL jsonb_array_elements(op.data) value
    WHERE COALESCE(value ->> 'times_caught', '') ~ '^[0-9]+$'
  ),
  awards_rows AS (
    SELECT
      10 AS sort_order,
      jsonb_build_object(
        'code', 'top_10_catcher',
        'title', 'Top 10 Catcher',
        'description', 'Finished in the top 10 catchers at this convention.'
      ) AS award
    FROM recap_row rr
    WHERE rr.final_rank IS NOT NULL
      AND rr.final_rank <= 10

    UNION ALL

    SELECT
      20 AS sort_order,
      jsonb_build_object(
        'code', 'crowd_favorite',
        'title', 'Crowd Favorite',
        'description', 'One of your suits was caught at least 5 times during this convention.'
      ) AS award
    FROM owned_award_metrics oam
    WHERE oam.max_owned_times_caught >= 5

    UNION ALL

    SELECT
      30 AS sort_order,
      jsonb_build_object(
        'code', 'daily_dedication',
        'title', 'Daily Dedication',
        'description', 'Completed daily tasks during the convention.'
      ) AS award
    FROM recap_row rr
    WHERE rr.daily_tasks_completed_count > 0
  ),
  awards_payload AS (
    SELECT COALESCE(jsonb_agg(ar.award ORDER BY ar.sort_order), '[]'::jsonb) AS data
    FROM awards_rows ar
  )
  SELECT
    rp.data AS recap,
    cp.data AS caught_fursuits,
    op.data AS owned_fursuits,
    ap.data AS achievements,
    dsp.data AS daily_summary,
    awp.data AS awards
  FROM recap_payload rp
  CROSS JOIN caught_payload cp
  CROSS JOIN owned_payload op
  CROSS JOIN achievements_payload ap
  CROSS JOIN daily_summary_payload dsp
  CROSS JOIN awards_payload awp;
$function$;

REVOKE ALL ON FUNCTION public.get_my_caught_suits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_catch_detail(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_fursuit_catches(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_convention_recap_detail(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_caught_suits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_catch_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fursuit_catches(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_convention_recap_detail(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_catch_decision(
  p_catch_id uuid,
  p_catcher_id uuid,
  p_fursuit_id uuid,
  p_fursuit_name text,
  p_decision text,
  p_rejection_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_notification_type text;
  v_can_view_fursuit boolean;
BEGIN
  IF p_decision = 'accept' THEN
    v_notification_type := 'catch_confirmed';
  ELSE
    v_notification_type := 'catch_rejected';
  END IF;

  v_can_view_fursuit := public.can_view_fursuit_as_profile(p_catcher_id, p_fursuit_id);

  INSERT INTO public.notifications (
    user_id,
    type,
    payload,
    created_at
  )
  VALUES (
    p_catcher_id,
    v_notification_type,
    jsonb_strip_nulls(
      jsonb_build_object(
        'adult_boundary_checked', true,
        'recipient_role', 'catcher',
        'catch_id', p_catch_id,
        'fursuit_id', p_fursuit_id,
        'fursuit_name',
          CASE WHEN v_can_view_fursuit THEN NULLIF(p_fursuit_name, '') ELSE NULL END,
        'decision', p_decision,
        'rejection_reason', p_rejection_reason
      )
    ),
    now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_pending_catches()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_expired_catches json;
  v_stale_pending_upload_count integer := 0;
BEGIN
  UPDATE public.catches c
     SET status = 'EXPIRED',
         photo_upload_state = 'failed'
   WHERE c.status = 'PENDING'
     AND c.catch_photo_source IS NOT NULL
     AND c.photo_upload_state = 'pending_upload'
     AND c.catch_photo_url IS NULL
     AND c.caught_at <= now() - interval '72 hours';

  GET DIAGNOSTICS v_stale_pending_upload_count = ROW_COUNT;

  WITH expired AS (
    UPDATE public.catches c
       SET status = 'EXPIRED'
     WHERE c.status = 'PENDING'
       AND c.expires_at <= now()
       AND (c.catch_photo_source IS NULL OR c.catch_photo_url IS NOT NULL)
     RETURNING
       c.id,
       c.catcher_id,
       c.fursuit_id,
       (SELECT f.name FROM public.fursuits f WHERE f.id = c.fursuit_id) AS fursuit_name,
       (SELECT f.owner_id FROM public.fursuits f WHERE f.id = c.fursuit_id) AS owner_id,
       (SELECT p.username FROM public.profiles p WHERE p.id = c.catcher_id) AS catcher_username
  ),
  enriched AS (
    SELECT
      expired.*,
      public.can_view_fursuit_as_profile(expired.catcher_id, expired.fursuit_id)
        AS catcher_can_view_fursuit,
      public.can_view_fursuit_as_profile(expired.owner_id, expired.fursuit_id)
        AS owner_can_view_fursuit,
      public.can_view_profile_as_profile(expired.owner_id, expired.catcher_id)
        AS owner_can_view_catcher
    FROM expired
  )
  SELECT json_agg(enriched) INTO v_expired_catches
  FROM enriched;

  RETURN json_build_object(
    'success', true,
    'expired_count', COALESCE(json_array_length(v_expired_catches), 0),
    'stale_pending_upload_count', v_stale_pending_upload_count,
    'expired_catches', COALESCE(v_expired_catches, '[]'::json),
    'timestamp', now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_pending_catches_for_convention_closeout(
  p_convention_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_expired_catches json;
  v_stale_pending_upload_count integer := 0;
BEGIN
  IF p_convention_id IS NULL THEN
    RAISE EXCEPTION 'convention_id is required';
  END IF;

  UPDATE public.catches c
     SET status = 'EXPIRED',
         photo_upload_state = 'failed',
         decided_at = now()
   WHERE c.convention_id = p_convention_id
     AND c.status = 'PENDING'
     AND c.catch_photo_source IS NOT NULL
     AND c.photo_upload_state = 'pending_upload'
     AND c.catch_photo_url IS NULL;

  GET DIAGNOSTICS v_stale_pending_upload_count = ROW_COUNT;

  WITH expired AS (
    UPDATE public.catches c
       SET status = 'EXPIRED',
           decided_at = now()
     WHERE c.convention_id = p_convention_id
       AND c.status = 'PENDING'
       AND (
         c.catch_photo_source IS NULL
         OR c.catch_photo_url IS NOT NULL
         OR c.photo_upload_state IS DISTINCT FROM 'pending_upload'
       )
     RETURNING
       c.id,
       c.catcher_id,
       c.convention_id,
       c.fursuit_id,
       (SELECT f.name FROM public.fursuits f WHERE f.id = c.fursuit_id) AS fursuit_name,
       (SELECT f.owner_id FROM public.fursuits f WHERE f.id = c.fursuit_id) AS owner_id,
       (SELECT p.username FROM public.profiles p WHERE p.id = c.catcher_id) AS catcher_username
  ),
  catch_notifications AS (
    SELECT
      expired.id,
      public.insert_catch_notification_once(
        expired.catcher_id,
        'catch_expired',
        jsonb_strip_nulls(
          jsonb_build_object(
            'adult_boundary_checked', true,
            'recipient_role', 'catcher',
            'fursuit_name',
              CASE
                WHEN public.can_view_fursuit_as_profile(expired.catcher_id, expired.fursuit_id)
                  THEN NULLIF(expired.fursuit_name, '')
                ELSE NULL
              END,
            'catch_id', expired.id
          )
        )
      )
    FROM expired
    WHERE expired.catcher_id IS NOT NULL
  ),
  owner_notifications AS (
    SELECT
      expired.id,
      public.insert_catch_notification_once(
        expired.owner_id,
        'catch_expired',
        jsonb_strip_nulls(
          jsonb_build_object(
            'adult_boundary_checked', true,
            'recipient_role', 'owner',
            'fursuit_name',
              CASE
                WHEN public.can_view_fursuit_as_profile(expired.owner_id, expired.fursuit_id)
                  THEN NULLIF(expired.fursuit_name, '')
                ELSE NULL
              END,
            'catcher_username',
              CASE
                WHEN public.can_view_profile_as_profile(expired.owner_id, expired.catcher_id)
                  THEN NULLIF(expired.catcher_username, '')
                ELSE NULL
              END,
            'catch_id', expired.id
          )
        )
      )
    FROM expired
    WHERE expired.owner_id IS NOT NULL
  ),
  gameplay_events AS (
    SELECT
      expired.id
    FROM expired
    CROSS JOIN LATERAL public.ingest_gameplay_event(
        'catch_expired',
        expired.catcher_id,
        expired.convention_id,
        jsonb_build_object(
          'catch_id', expired.id,
          'fursuit_id', expired.fursuit_id,
          'catcher_id', expired.catcher_id,
          'owner_id', expired.owner_id
        ),
        now(),
        'catch:' || expired.id::text || ':expired'
      ) AS gameplay_event
    WHERE expired.catcher_id IS NOT NULL
  ),
  side_effects AS (
    SELECT
      (SELECT count(*) FROM catch_notifications) AS catcher_notification_count,
      (SELECT count(*) FROM owner_notifications) AS owner_notification_count,
      (SELECT count(*) FROM gameplay_events) AS gameplay_event_count
  )
  SELECT json_agg(expired) INTO v_expired_catches
  FROM expired
  CROSS JOIN side_effects;

  RETURN json_build_object(
    'success', true,
    'expired_count', COALESCE(json_array_length(v_expired_catches), 0),
    'stale_pending_upload_count', v_stale_pending_upload_count,
    'expired_catches', COALESCE(v_expired_catches, '[]'::json),
    'timestamp', now()
  );
END;
$function$;
