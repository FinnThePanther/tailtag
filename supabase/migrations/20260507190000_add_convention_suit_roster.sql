ALTER TABLE public.fursuit_conventions
  ADD COLUMN IF NOT EXISTS roster_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS catchable_now boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS catchable_updated_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.normalize_fursuit_convention_roster_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.roster_visible IS FALSE THEN
    NEW.catchable_now := false;
    NEW.catchable_updated_at := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.catchable_updated_at := CASE WHEN NEW.catchable_now THEN now() ELSE NULL END;
  ELSIF NEW.catchable_now IS DISTINCT FROM OLD.catchable_now THEN
    NEW.catchable_updated_at := CASE WHEN NEW.catchable_now THEN now() ELSE NULL END;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS normalize_fursuit_convention_roster_state_trigger
  ON public.fursuit_conventions;

CREATE TRIGGER normalize_fursuit_convention_roster_state_trigger
BEFORE INSERT OR UPDATE OF roster_visible, catchable_now
ON public.fursuit_conventions
FOR EACH ROW
EXECUTE FUNCTION public.normalize_fursuit_convention_roster_state();

ALTER TABLE public.fursuit_conventions
  DROP CONSTRAINT IF EXISTS fursuit_conventions_catchable_requires_visible;

ALTER TABLE public.fursuit_conventions
  ADD CONSTRAINT fursuit_conventions_catchable_requires_visible
  CHECK (roster_visible OR NOT catchable_now);

CREATE OR REPLACE FUNCTION public.get_convention_suit_roster(p_convention_id uuid)
RETURNS TABLE(
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
  catchable_now boolean,
  catchable_updated_at timestamp with time zone,
  convention_catch_count bigint,
  caught_by_current_user boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
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
    colors.color_assignments,
    fc.roster_visible,
    fc.catchable_now,
    fc.catchable_updated_at,
    coalesce(catch_counts.convention_catch_count, 0) AS convention_catch_count,
    coalesce(current_user_catches.caught_by_current_user, false) AS caught_by_current_user
  FROM public.fursuit_conventions fc
  JOIN public.fursuits f ON f.id = fc.fursuit_id
  JOIN public.profiles p ON p.id = f.owner_id
  LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
  LEFT JOIN LATERAL (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'position', fca.position,
          'color', jsonb_build_object(
            'id', fursuit_colors.id,
            'name', fursuit_colors.name,
            'normalized_name', fursuit_colors.normalized_name
          )
        )
        ORDER BY fca.position ASC, fursuit_colors.name ASC
      ),
      '[]'::jsonb
    ) AS color_assignments
    FROM public.fursuit_color_assignments fca
    JOIN public.fursuit_colors ON fursuit_colors.id = fca.color_id
    WHERE fca.fursuit_id = f.id
  ) colors ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS convention_catch_count
    FROM public.catches c
    WHERE c.fursuit_id = f.id
      AND c.convention_id = p_convention_id
      AND c.status = 'ACCEPTED'
      AND c.is_tutorial = false
  ) catch_counts ON true
  LEFT JOIN LATERAL (
    SELECT true AS caught_by_current_user
    FROM public.catches c
    WHERE c.fursuit_id = f.id
      AND c.convention_id = p_convention_id
      AND c.catcher_id = auth.uid()
      AND c.status = 'ACCEPTED'
      AND c.is_tutorial = false
    LIMIT 1
  ) current_user_catches ON true
  WHERE fc.convention_id = p_convention_id
    AND fc.roster_visible = true
    AND f.is_tutorial = false
    AND f.is_flagged = false
    AND (
      p.is_suspended = false
      OR (p.suspended_until IS NOT NULL AND p.suspended_until <= now())
    )
    AND (
      auth.uid() = f.owner_id
      OR public.is_blocked(auth.uid(), f.owner_id) = false
    )
  ORDER BY fc.catchable_now DESC, f.name ASC, f.id ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_convention_suit_roster(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_convention_suit_roster(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_convention_suit_roster(uuid) TO authenticated;
