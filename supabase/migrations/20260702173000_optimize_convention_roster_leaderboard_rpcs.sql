-- Avoid row-by-row privacy helper calls in large live conventions. Anthrocon 2026
-- has enough roster rows that the helper-heavy RPCs can exceed PostgREST timeouts.

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
    SELECT
      auth.uid() AS id,
      (
        auth.role() = 'service_role'
        OR coalesce(viewer.role IN ('owner', 'moderator'), false)
      ) AS is_elevated,
      coalesce(viewer.is_adult, false) AS is_adult
    FROM (SELECT auth.uid() AS id) current_auth
    LEFT JOIN public.profiles viewer ON viewer.id = current_auth.id
  ),
  roster_base AS (
    SELECT
      f.id AS fursuit_id,
      fc.convention_id,
      f.name AS fursuit_name,
      f.avatar_path AS fursuit_avatar_path,
      f.avatar_url AS fursuit_avatar_url,
      CASE
        WHEN cu.id = f.owner_id
          OR cu.is_elevated
          OR f.owner_attribution_visibility = 'public'
          THEN f.owner_id
        ELSE NULL::uuid
      END AS owner_id,
      CASE
        WHEN cu.id = f.owner_id
          OR cu.is_elevated
          OR f.owner_attribution_visibility = 'public'
          THEN owner_profile.username
        ELSE NULL::text
      END AS owner_username,
      fs.id AS species_id,
      fs.name AS species_name,
      fc.roster_visible
    FROM public.fursuit_conventions fc
    JOIN public.fursuits f ON f.id = fc.fursuit_id
    JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
    LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
    CROSS JOIN auth_context cu
    LEFT JOIN public.user_blocks ub
      ON (
        (ub.blocker_id = cu.id AND ub.blocked_id = f.owner_id)
        OR (ub.blocker_id = f.owner_id AND ub.blocked_id = cu.id)
      )
    WHERE cu.id IS NOT NULL
      AND fc.convention_id = p_convention_id
      AND fc.roster_visible = true
      AND fc.roster_state = 'active'
      AND fc.active_until IS NULL
      AND f.is_flagged = false
      AND (
        cu.id = f.owner_id
        OR cu.is_elevated
        OR (
          owner_profile.visibility_audience = 'everyone'
          AND f.visibility_audience = 'everyone'
        )
        OR (
          (
            owner_profile.visibility_audience = 'adults_only'
            OR f.visibility_audience = 'adults_only'
          )
          AND cu.is_adult
        )
      )
      AND (
        owner_profile.is_suspended = false
        OR (
          owner_profile.suspended_until IS NOT NULL
          AND owner_profile.suspended_until <= now()
        )
      )
      AND (
        cu.id = f.owner_id
        OR ub.blocker_id IS NULL
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
    JOIN public.profiles catcher_profile ON catcher_profile.id = c.catcher_id
    CROSS JOIN auth_context cu
    WHERE c.convention_id = p_convention_id
      AND c.status = 'ACCEPTED'
      AND (
        cu.id = c.catcher_id
        OR cu.is_elevated
        OR catcher_profile.visibility_audience = 'everyone'
        OR (
          catcher_profile.visibility_audience = 'adults_only'
          AND cu.is_adult
        )
      )
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

CREATE OR REPLACE FUNCTION public.get_convention_suit_leaderboard(p_convention_id uuid)
RETURNS TABLE(
  fursuit_id uuid,
  convention_id uuid,
  fursuit_name text,
  fursuit_avatar_path text,
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
    SELECT
      auth.uid() AS id,
      (
        auth.role() = 'service_role'
        OR coalesce(viewer.role IN ('owner', 'moderator'), false)
      ) AS is_elevated,
      coalesce(viewer.is_adult, false) AS is_adult
    FROM (SELECT auth.uid() AS id) current_auth
    LEFT JOIN public.profiles viewer ON viewer.id = current_auth.id
  ),
  leaderboard AS (
    SELECT
      c.fursuit_id,
      c.convention_id,
      count(*) AS catch_count,
      count(distinct c.catcher_id) AS unique_catchers,
      max(c.caught_at) AS last_caught_at,
      min(c.caught_at) AS first_caught_at
    FROM public.catches c
    CROSS JOIN auth_context cu
    WHERE cu.id IS NOT NULL
      AND c.status = 'ACCEPTED'
      AND c.catch_credit_scope = 'full'
      AND c.convention_id = p_convention_id
    GROUP BY c.fursuit_id, c.convention_id
  ),
  leaderboard_rows AS (
    SELECT
      l.fursuit_id,
      l.convention_id,
      f.name AS fursuit_name,
      f.avatar_path AS fursuit_avatar_path,
      f.avatar_url AS fursuit_avatar_url,
      f.owner_id,
      fs.id AS species_id,
      fs.name AS species_name,
      l.catch_count,
      l.unique_catchers,
      l.last_caught_at,
      l.first_caught_at,
      (
        cu.id = f.owner_id
        OR cu.is_elevated
        OR (
          owner_profile.visibility_audience = 'everyone'
          AND f.visibility_audience = 'everyone'
        )
        OR (
          (
            owner_profile.visibility_audience = 'adults_only'
            OR f.visibility_audience = 'adults_only'
          )
          AND cu.is_adult
        )
      ) AS can_view_fursuit,
      (
        cu.id = f.owner_id
        OR cu.is_elevated
        OR f.owner_attribution_visibility = 'public'
      ) AS can_view_owner
    FROM leaderboard l
    JOIN public.fursuits f ON f.id = l.fursuit_id
    JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
    LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
    CROSS JOIN auth_context cu
    LEFT JOIN public.user_blocks ub
      ON (
        (ub.blocker_id = cu.id AND ub.blocked_id = f.owner_id)
        OR (ub.blocker_id = f.owner_id AND ub.blocked_id = cu.id)
      )
    WHERE cu.id IS NOT NULL
      AND (
        cu.id = f.owner_id
        OR ub.blocker_id IS NULL
      )
  ),
  leaderboard_colors AS (
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
    JOIN leaderboard_rows lr ON lr.fursuit_id = fca.fursuit_id
    WHERE lr.can_view_fursuit
    GROUP BY fca.fursuit_id
  )
  SELECT
    lr.fursuit_id,
    lr.convention_id,
    CASE WHEN lr.can_view_fursuit THEN lr.fursuit_name ELSE NULL::text END AS fursuit_name,
    CASE WHEN lr.can_view_fursuit THEN lr.fursuit_avatar_path ELSE NULL::text END AS fursuit_avatar_path,
    CASE WHEN lr.can_view_fursuit THEN lr.fursuit_avatar_url ELSE NULL::text END AS fursuit_avatar_url,
    CASE WHEN lr.can_view_fursuit AND lr.can_view_owner THEN lr.owner_id ELSE NULL::uuid END AS owner_id,
    CASE WHEN lr.can_view_fursuit THEN lr.species_id ELSE NULL::uuid END AS species_id,
    CASE WHEN lr.can_view_fursuit THEN lr.species_name ELSE NULL::text END AS species_name,
    CASE WHEN lr.can_view_fursuit THEN coalesce(lc.color_assignments, '[]'::jsonb) ELSE '[]'::jsonb END AS color_assignments,
    lr.catch_count,
    lr.unique_catchers,
    lr.last_caught_at,
    lr.first_caught_at,
    NOT lr.can_view_fursuit AS fursuit_redacted
  FROM leaderboard_rows lr
  LEFT JOIN leaderboard_colors lc ON lc.fursuit_id = lr.fursuit_id
  ORDER BY lr.catch_count DESC, fursuit_name ASC NULLS LAST, lr.fursuit_id ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_convention_suit_roster(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_convention_suit_leaderboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_convention_suit_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_convention_suit_leaderboard(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
