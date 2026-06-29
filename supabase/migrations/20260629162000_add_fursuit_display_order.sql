ALTER TABLE public.fursuits
  ADD COLUMN IF NOT EXISTS display_order integer;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY owner_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) - 1 AS next_display_order
  FROM public.fursuits
  WHERE display_order IS NULL
)
UPDATE public.fursuits f
SET display_order = ranked.next_display_order
FROM ranked
WHERE f.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_fursuits_owner_display_order
  ON public.fursuits (owner_id, display_order, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.set_new_fursuit_display_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NEW.display_order IS NULL THEN
    SELECT coalesce(min(display_order) - 1, 0)
    INTO NEW.display_order
    FROM public.fursuits
    WHERE owner_id = NEW.owner_id;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_new_fursuit_display_order()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_new_fursuit_display_order
  ON public.fursuits;

CREATE TRIGGER set_new_fursuit_display_order
BEFORE INSERT ON public.fursuits
FOR EACH ROW
EXECUTE FUNCTION public.set_new_fursuit_display_order();

CREATE OR REPLACE FUNCTION public.reorder_own_fursuits(p_fursuit_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_requested_count integer;
  v_distinct_requested_count integer;
  v_owned_count integer;
BEGIN
  IF v_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to reorder fursuits'
      USING ERRCODE = '42501';
  END IF;

  IF p_fursuit_ids IS NULL THEN
    RAISE EXCEPTION 'Fursuit order is required'
      USING ERRCODE = '22004';
  END IF;

  PERFORM 1
  FROM public.fursuits f
  WHERE f.owner_id = v_viewer_id
  FOR UPDATE;

  SELECT count(*), count(DISTINCT requested.fursuit_id)
  INTO v_requested_count, v_distinct_requested_count
  FROM unnest(p_fursuit_ids) AS requested(fursuit_id);

  SELECT count(*)
  INTO v_owned_count
  FROM public.fursuits f
  WHERE f.owner_id = v_viewer_id;

  IF v_requested_count <> v_distinct_requested_count
    OR v_requested_count <> v_owned_count
    OR EXISTS (
      SELECT 1
      FROM unnest(p_fursuit_ids) AS requested(fursuit_id)
      LEFT JOIN public.fursuits f
        ON f.id = requested.fursuit_id
        AND f.owner_id = v_viewer_id
      WHERE f.id IS NULL
    )
  THEN
    RAISE EXCEPTION 'Fursuit order must include every owned fursuit exactly once'
      USING ERRCODE = '22023';
  END IF;

  WITH requested AS (
    SELECT
      fursuit_id,
      ordinality::integer - 1 AS next_display_order
    FROM unnest(p_fursuit_ids) WITH ORDINALITY AS requested(fursuit_id, ordinality)
  )
  UPDATE public.fursuits f
  SET display_order = requested.next_display_order
  FROM requested
  WHERE f.id = requested.fursuit_id
    AND f.owner_id = v_viewer_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_own_fursuits(uuid[])
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_own_fursuits(uuid[]) TO authenticated;

DROP FUNCTION IF EXISTS public.get_profile_fursuits(uuid);
CREATE OR REPLACE FUNCTION public.get_profile_fursuits(p_profile_id uuid)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  name text,
  species_id uuid,
  avatar_path text,
  avatar_url text,
  description text,
  visibility_audience text,
  owner_attribution_visibility text,
  social_signal text,
  interaction_badges text[],
  catch_count integer,
  created_at timestamp with time zone,
  display_order integer,
  species_entry jsonb,
  color_assignments jsonb,
  fursuit_conventions jsonb,
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
  visible_fursuits AS (
    SELECT
      f.*,
      public.can_view_fursuit_owner((SELECT id FROM viewer), f.id) AS can_view_owner
    FROM public.fursuits f
    WHERE f.owner_id = p_profile_id
      AND (SELECT id FROM viewer) IS NOT NULL
      AND public.can_view_fursuit((SELECT id FROM viewer), f.id)
      AND public.can_view_fursuit_owner((SELECT id FROM viewer), f.id)
  )
  SELECT
    f.id,
    f.owner_id,
    f.name,
    f.species_id,
    f.avatar_path,
    f.avatar_url,
    f.description,
    f.visibility_audience,
    f.owner_attribution_visibility,
    f.social_signal,
    coalesce(f.interaction_badges, '{}'::text[]),
    coalesce(f.catch_count, 0),
    f.created_at,
    f.display_order,
    CASE
      WHEN fs.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', fs.id,
        'name', fs.name,
        'normalized_name', fs.normalized_name
      )
    END,
    coalesce(colors.data, '[]'::jsonb),
    coalesce(conventions.data, '[]'::jsonb),
    CASE
      WHEN bio.data IS NULL THEN NULL
      WHEN f.can_view_owner THEN bio.data
      ELSE bio.data - 'owner_name' || jsonb_build_object('owner_name', NULL)
    END,
    CASE WHEN f.can_view_owner THEN coalesce(owner_profile.social_links, '[]'::jsonb) ELSE '[]'::jsonb END,
    coalesce(makers.data, '[]'::jsonb)
  FROM visible_fursuits f
  LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
  LEFT JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
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
      ORDER BY fca.position ASC, fc.name ASC
    ) AS data
    FROM public.fursuit_color_assignments fca
    JOIN public.fursuit_colors fc ON fc.id = fca.color_id
    WHERE fca.fursuit_id = f.id
  ) colors ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'roster_visible', fc.roster_visible,
        'roster_state', fc.roster_state,
        'active_until', fc.active_until,
        'convention', jsonb_build_object(
          'id', c.id,
          'slug', c.slug,
          'name', c.name,
          'location', c.location,
          'start_date', c.start_date,
          'end_date', c.end_date,
          'timezone', c.timezone,
          'status', c.status,
          'finalizing_started_at', c.finalizing_started_at,
          'closeout_not_before', c.closeout_not_before,
          'latitude', c.latitude,
          'longitude', c.longitude,
          'geofence_radius_meters', c.geofence_radius_meters,
          'geofence_enabled', c.geofence_enabled,
          'location_verification_required', c.location_verification_required
        )
      )
      ORDER BY c.start_date DESC NULLS LAST, c.name ASC
    ) AS data
    FROM public.fursuit_conventions fc
    JOIN public.conventions c ON c.id = fc.convention_id
    WHERE fc.fursuit_id = f.id
  ) conventions ON true
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
  ORDER BY f.display_order ASC NULLS LAST, f.created_at DESC NULLS LAST, f.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_profile_fursuits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_fursuits(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
