-- Keep the convention suit leaderboard complete under RLS.
--
-- This RPC lists every suit at a convention with at least one accepted,
-- non-tutorial catch, ranked by catch count. It runs as SECURITY DEFINER so
-- every player sees the same convention-wide suit rankings.

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
  SELECT
    c.fursuit_id,
    c.convention_id,
    f.name AS fursuit_name,
    f.avatar_url AS fursuit_avatar_url,
    f.owner_id,
    fs.id AS species_id,
    fs.name AS species_name,
    colors.color_assignments,
    count(*) AS catch_count,
    count(DISTINCT c.catcher_id) AS unique_catchers,
    max(c.caught_at) AS last_caught_at,
    min(c.caught_at) AS first_caught_at
  FROM public.catches c
  JOIN public.fursuits f ON f.id = c.fursuit_id
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
  WHERE c.status = 'ACCEPTED'
    AND c.is_tutorial = false
    AND c.convention_id = p_convention_id
  GROUP BY
    c.fursuit_id,
    c.convention_id,
    f.name,
    f.avatar_url,
    f.owner_id,
    fs.id,
    fs.name,
    colors.color_assignments
  ORDER BY catch_count DESC, f.name ASC, c.fursuit_id ASC;
$function$;
