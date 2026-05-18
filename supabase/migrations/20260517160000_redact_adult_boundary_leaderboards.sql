-- Keep leaderboards complete while redacting restricted profile/fursuit content.

DROP FUNCTION IF EXISTS public.get_convention_leaderboard(uuid);

CREATE OR REPLACE FUNCTION public.get_convention_leaderboard(p_convention_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  catcher_id uuid,
  convention_id uuid,
  username text,
  catch_count bigint,
  unique_fursuits bigint,
  unique_species bigint,
  last_catch_at timestamp with time zone,
  first_catch_at timestamp with time zone,
  profile_redacted boolean
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
      c.catcher_id,
      c.convention_id,
      count(*) AS catch_count,
      count(DISTINCT c.fursuit_id) AS unique_fursuits,
      count(DISTINCT f.species_id) AS unique_species,
      max(c.caught_at) AS last_catch_at,
      min(c.caught_at) AS first_catch_at
    FROM public.catches c
    JOIN public.fursuits f ON f.id = c.fursuit_id
    CROSS JOIN auth_context cu
    WHERE cu.id IS NOT NULL
      AND c.status = 'ACCEPTED'
      AND c.is_tutorial = false
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

REVOKE ALL ON FUNCTION public.get_convention_leaderboard(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_convention_leaderboard(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_convention_leaderboard(uuid) TO authenticated;

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
      count(DISTINCT c.catcher_id) AS unique_catchers,
      max(c.caught_at) AS last_caught_at,
      min(c.caught_at) AS first_caught_at
    FROM public.catches c
    CROSS JOIN auth_context cu
    WHERE cu.id IS NOT NULL
      AND c.status = 'ACCEPTED'
      AND c.is_tutorial = false
      AND c.convention_id = p_convention_id
    GROUP BY c.fursuit_id, c.convention_id
  )
  SELECT
    l.fursuit_id,
    l.convention_id,
    CASE
      WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN f.name
      ELSE NULL
    END AS fursuit_name,
    CASE
      WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN f.avatar_url
      ELSE NULL
    END AS fursuit_avatar_url,
    CASE
      WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN f.owner_id
      ELSE NULL
    END AS owner_id,
    CASE
      WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN fs.id
      ELSE NULL
    END AS species_id,
    CASE
      WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN fs.name
      ELSE NULL
    END AS species_name,
    CASE
      WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN colors.color_assignments
      ELSE '[]'::jsonb
    END AS color_assignments,
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
          'color', jsonb_build_object(
            'id', fc.id,
            'name', fc.name,
            'normalized_name', fc.normalized_name
          )
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

REVOKE ALL ON FUNCTION public.get_convention_suit_leaderboard(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_convention_suit_leaderboard(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_convention_suit_leaderboard(uuid) TO authenticated;
