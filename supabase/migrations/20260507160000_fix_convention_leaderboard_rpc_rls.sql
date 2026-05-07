-- Keep the public leaderboard complete under RLS.
--
-- The mobile app now reads the player leaderboard through this SECURITY DEFINER
-- RPC instead of the security-invoker view. Aggregate directly from base tables
-- so the result does not depend on request.path policies or view security mode.

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
  SELECT
    c.catcher_id,
    c.convention_id,
    p.username,
    count(*) AS catch_count,
    count(DISTINCT c.fursuit_id) AS unique_fursuits,
    count(DISTINCT f.species_id) AS unique_species,
    max(c.caught_at) AS last_catch_at,
    min(c.caught_at) AS first_catch_at
  FROM public.catches c
  JOIN public.profiles p ON p.id = c.catcher_id
  LEFT JOIN public.fursuits f ON f.id = c.fursuit_id
  WHERE c.status = 'ACCEPTED'
    AND c.is_tutorial = false
    AND (p_convention_id IS NULL OR c.convention_id = p_convention_id)
  GROUP BY c.catcher_id, c.convention_id, p.username
  ORDER BY catch_count DESC, p.username ASC NULLS LAST, c.catcher_id ASC;
$function$;
