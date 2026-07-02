CREATE OR REPLACE FUNCTION public.get_convention_fursuit_picker_roster(p_convention_ids uuid[])
RETURNS TABLE (
  fursuit_id uuid,
  convention_id uuid,
  fursuit_name text,
  fursuit_avatar_path text,
  fursuit_avatar_url text,
  owner_id uuid,
  species_id uuid,
  species_name text,
  roster_visible boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH auth_context AS (
    SELECT auth.uid() AS id
  ),
  requested_conventions AS (
    SELECT DISTINCT convention_id
    FROM unnest(coalesce(p_convention_ids, ARRAY[]::uuid[])) AS requested(convention_id)
    WHERE convention_id IS NOT NULL
  )
  SELECT
    f.id AS fursuit_id,
    fc.convention_id,
    f.name AS fursuit_name,
    f.avatar_path AS fursuit_avatar_path,
    f.avatar_url AS fursuit_avatar_url,
    CASE WHEN public.can_view_fursuit_owner(cu.id, f.id) THEN f.owner_id ELSE NULL END AS owner_id,
    fs.id AS species_id,
    fs.name AS species_name,
    fc.roster_visible
  FROM requested_conventions rc
  JOIN public.fursuit_conventions fc ON fc.convention_id = rc.convention_id
  JOIN public.fursuits f ON f.id = fc.fursuit_id
  JOIN public.profiles p ON p.id = f.owner_id
  LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
  CROSS JOIN auth_context cu
  WHERE cu.id IS NOT NULL
    AND fc.roster_visible = true
    AND fc.roster_state = 'active'
    AND fc.active_until IS NULL
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
  ORDER BY fc.convention_id ASC, f.name ASC, f.id ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_convention_fursuit_picker_roster(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_convention_fursuit_picker_roster(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_convention_fursuit_picker_roster(uuid[]) TO authenticated;
