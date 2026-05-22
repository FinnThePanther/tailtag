-- Keep convention roster surfaces aligned with durable fursuit assignment state.

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
      AND fc.roster_state = 'active'
      AND fc.active_until IS NULL
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
