-- Filter adult-boundary restricted records from high-visibility social surfaces.
-- Staff/admin search surfaces intentionally remain unchanged in this phase.

CREATE OR REPLACE FUNCTION public.get_convention_suit_roster(p_convention_id uuid)
RETURNS TABLE (
  fursuit_id uuid,
  convention_id uuid,
  fursuit_name text,
  fursuit_avatar_path text,
  fursuit_avatar_url text,
  owner_id uuid,
  owner_username text,
  species_id uuid,
  species_name text,
  color_assignments jsonb,
  roster_visible boolean,
  convention_catch_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH auth_context AS (
    SELECT auth.uid() AS id
  ),
  roster_base AS (
    SELECT
      f.id AS fursuit_id,
      fc.convention_id,
      f.name AS fursuit_name,
      f.avatar_path AS fursuit_avatar_path,
      f.avatar_url AS fursuit_avatar_url,
      f.owner_id,
      p.username AS owner_username,
      fs.id AS species_id,
      fs.name AS species_name,
      fc.roster_visible
    FROM public.fursuit_conventions fc
    JOIN public.fursuits f ON f.id = fc.fursuit_id
    JOIN public.profiles p ON p.id = f.owner_id
    LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
    CROSS JOIN auth_context cu
    WHERE cu.id IS NOT NULL
      AND fc.convention_id = p_convention_id
      AND fc.roster_visible = true
      AND f.is_tutorial = false
      AND f.is_flagged = false
      AND public.can_view_fursuit(cu.id, f.id)
      AND (
        p.is_suspended = false
        OR (p.suspended_until IS NOT NULL AND p.suspended_until <= now())
      )
      AND (
        cu.id = f.owner_id
        OR public.is_blocked(cu.id, f.owner_id) = false
      )
  ),
  roster_colors AS (
    SELECT
      fca.fursuit_id,
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
      ) AS color_assignments
    FROM public.fursuit_color_assignments fca
    JOIN public.fursuit_colors fc ON fc.id = fca.color_id
    JOIN roster_base rb ON rb.fursuit_id = fca.fursuit_id
    GROUP BY fca.fursuit_id
  ),
  convention_catch_counts AS (
    SELECT
      c.fursuit_id,
      count(*) AS convention_catch_count
    FROM public.catches c
    JOIN roster_base rb ON rb.fursuit_id = c.fursuit_id
    CROSS JOIN auth_context cu
    WHERE c.convention_id = p_convention_id
      AND c.status = 'ACCEPTED'
      AND c.is_tutorial = false
      AND public.can_view_profile(cu.id, c.catcher_id)
    GROUP BY c.fursuit_id
  )
  SELECT
    rb.fursuit_id,
    rb.convention_id,
    rb.fursuit_name,
    rb.fursuit_avatar_path,
    rb.fursuit_avatar_url,
    rb.owner_id,
    rb.owner_username,
    rb.species_id,
    rb.species_name,
    coalesce(rc.color_assignments, '[]'::jsonb) AS color_assignments,
    rb.roster_visible,
    coalesce(cc.convention_catch_count, 0) AS convention_catch_count
  FROM roster_base rb
  LEFT JOIN roster_colors rc ON rc.fursuit_id = rb.fursuit_id
  LEFT JOIN convention_catch_counts cc ON cc.fursuit_id = rb.fursuit_id
  ORDER BY rb.fursuit_name ASC, rb.fursuit_id ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_convention_suit_roster(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_convention_suit_roster(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_convention_suit_roster(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_convention_leaderboard(p_convention_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  catcher_id uuid,
  convention_id uuid,
  username text,
  catch_count bigint,
  unique_fursuits bigint,
  unique_species bigint,
  last_catch_at timestamp with time zone,
  first_catch_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH auth_context AS (
    SELECT auth.uid() AS id
  ),
  visible_catches AS (
    SELECT
      c.catcher_id,
      c.convention_id,
      c.fursuit_id,
      c.caught_at,
      f.species_id
    FROM public.catches c
    JOIN public.fursuits f ON f.id = c.fursuit_id
    CROSS JOIN auth_context cu
    WHERE cu.id IS NOT NULL
      AND c.status = 'ACCEPTED'
      AND c.is_tutorial = false
      AND (p_convention_id IS NULL OR c.convention_id = p_convention_id)
      AND public.can_view_profile(cu.id, c.catcher_id)
      AND public.can_view_fursuit(cu.id, c.fursuit_id)
  )
  SELECT
    vc.catcher_id,
    vc.convention_id,
    p.username,
    count(*) AS catch_count,
    count(DISTINCT vc.fursuit_id) AS unique_fursuits,
    count(DISTINCT vc.species_id) AS unique_species,
    max(vc.caught_at) AS last_catch_at,
    min(vc.caught_at) AS first_catch_at
  FROM visible_catches vc
  JOIN public.profiles p ON p.id = vc.catcher_id
  GROUP BY vc.catcher_id, vc.convention_id, p.username
  ORDER BY catch_count DESC, p.username ASC NULLS LAST, vc.catcher_id ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_convention_leaderboard(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_convention_leaderboard(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_convention_leaderboard(uuid) TO authenticated;

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
  first_caught_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH auth_context AS (
    SELECT auth.uid() AS id
  ),
  visible_catches AS (
    SELECT
      c.fursuit_id,
      c.convention_id,
      c.catcher_id,
      c.caught_at
    FROM public.catches c
    CROSS JOIN auth_context cu
    WHERE cu.id IS NOT NULL
      AND c.status = 'ACCEPTED'
      AND c.is_tutorial = false
      AND c.convention_id = p_convention_id
      AND public.can_view_profile(cu.id, c.catcher_id)
      AND public.can_view_fursuit(cu.id, c.fursuit_id)
  )
  SELECT
    vc.fursuit_id,
    vc.convention_id,
    f.name AS fursuit_name,
    f.avatar_url AS fursuit_avatar_url,
    f.owner_id,
    fs.id AS species_id,
    fs.name AS species_name,
    colors.color_assignments,
    count(*) AS catch_count,
    count(DISTINCT vc.catcher_id) AS unique_catchers,
    max(vc.caught_at) AS last_caught_at,
    min(vc.caught_at) AS first_caught_at
  FROM visible_catches vc
  JOIN public.fursuits f ON f.id = vc.fursuit_id
  LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
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
  GROUP BY
    vc.fursuit_id,
    vc.convention_id,
    f.name,
    f.avatar_url,
    f.owner_id,
    fs.id,
    fs.name,
    colors.color_assignments
  ORDER BY catch_count DESC, f.name ASC, vc.fursuit_id ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_convention_suit_leaderboard(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_convention_suit_leaderboard(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_convention_suit_leaderboard(uuid) TO authenticated;
