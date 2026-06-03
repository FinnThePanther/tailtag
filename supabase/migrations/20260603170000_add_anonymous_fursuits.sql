-- TAILTAG-59: anonymous fursuits with hidden public owner attribution.

ALTER TABLE public.fursuits
  ADD COLUMN IF NOT EXISTS owner_attribution_visibility text NOT NULL DEFAULT 'public';

ALTER TABLE public.fursuits
  DROP CONSTRAINT IF EXISTS fursuits_owner_attribution_visibility_check;

ALTER TABLE public.fursuits
  ADD CONSTRAINT fursuits_owner_attribution_visibility_check
  CHECK (owner_attribution_visibility IN ('public', 'hidden'));

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  rollout_percentage integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT feature_flags_rollout_percentage_check
    CHECK (rollout_percentage BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS public.feature_flag_profile_overrides (
  feature_key text NOT NULL REFERENCES public.feature_flags(key) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  reason text,
  created_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_key, profile_id)
);

CREATE INDEX IF NOT EXISTS feature_flag_profile_overrides_profile_id_idx
  ON public.feature_flag_profile_overrides (profile_id);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flag_profile_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_admin_read" ON public.feature_flags;
CREATE POLICY "feature_flags_admin_read"
ON public.feature_flags
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) IN ('owner', 'organizer', 'moderator')
);

DROP POLICY IF EXISTS "feature_flags_owner_organizer_write" ON public.feature_flags;
CREATE POLICY "feature_flags_owner_organizer_write"
ON public.feature_flags
FOR ALL
TO authenticated
USING (
  public.get_user_role(auth.uid()) IN ('owner', 'organizer')
)
WITH CHECK (
  public.get_user_role(auth.uid()) IN ('owner', 'organizer')
);

DROP POLICY IF EXISTS "feature_flag_profile_overrides_admin_read" ON public.feature_flag_profile_overrides;
CREATE POLICY "feature_flag_profile_overrides_admin_read"
ON public.feature_flag_profile_overrides
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) IN ('owner', 'organizer', 'moderator')
);

DROP POLICY IF EXISTS "feature_flag_profile_overrides_owner_organizer_write" ON public.feature_flag_profile_overrides;
CREATE POLICY "feature_flag_profile_overrides_owner_organizer_write"
ON public.feature_flag_profile_overrides
FOR ALL
TO authenticated
USING (
  public.get_user_role(auth.uid()) IN ('owner', 'organizer')
)
WITH CHECK (
  public.get_user_role(auth.uid()) IN ('owner', 'organizer')
);

INSERT INTO public.feature_flags (key, description, enabled, rollout_percentage)
VALUES (
  'anonymous_fursuits',
  'Allow selected players to hide public owner attribution for individual fursuits.',
  false,
  0
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_view_fursuit_owner(
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
    LEFT JOIN public.profiles viewer_profile ON viewer_profile.id = p_viewer_id
    WHERE f.id = p_fursuit_id
      AND (
        auth.role() = 'service_role'
        OR (
          p_viewer_id = auth.uid()
          AND (
            p_viewer_id = f.owner_id
            OR viewer_profile.role IN ('owner', 'moderator')
            OR f.owner_attribution_visibility = 'public'
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.can_view_fursuit_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_fursuit_owner(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_feature_enabled_for_profile(
  p_feature_key text,
  p_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH selected_override AS (
    SELECT o.enabled
    FROM public.feature_flag_profile_overrides o
    WHERE o.feature_key = p_feature_key
      AND o.profile_id = p_profile_id
    LIMIT 1
  ),
  selected_flag AS (
    SELECT
      f.enabled,
      f.rollout_percentage,
      (
        mod(
          abs(hashtextextended(f.key || ':' || p_profile_id::text, 0)),
          100
        )
      )::integer AS rollout_bucket
    FROM public.feature_flags f
    WHERE f.key = p_feature_key
    LIMIT 1
  )
  SELECT coalesce(
    (SELECT enabled FROM selected_override),
    (
      SELECT enabled = true
        AND rollout_percentage > 0
        AND rollout_bucket < rollout_percentage
      FROM selected_flag
    ),
    false
  )
  WHERE auth.role() = 'service_role'
     OR p_profile_id = auth.uid()
     OR public.get_user_role(auth.uid()) IN ('owner', 'organizer', 'moderator');
$function$;

REVOKE ALL ON FUNCTION public.is_feature_enabled_for_profile(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled_for_profile(text, uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "fursuits_select_adult_boundary" ON public.fursuits;
CREATE POLICY "fursuits_select_owner_or_moderation"
ON public.fursuits
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR public.is_elevated_privacy_viewer(auth.uid())
);

DROP POLICY IF EXISTS "fursuit_bios_select_adult_boundary" ON public.fursuit_bios;
CREATE POLICY "fursuit_bios_select_owner_visible"
ON public.fursuit_bios
FOR SELECT
TO authenticated
USING (
  public.can_view_fursuit(auth.uid(), fursuit_id)
  AND public.can_view_fursuit_owner(auth.uid(), fursuit_id)
);

CREATE OR REPLACE FUNCTION public.touch_feature_flag_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS feature_flags_touch_updated_at ON public.feature_flags;
CREATE TRIGGER feature_flags_touch_updated_at
BEFORE UPDATE ON public.feature_flags
FOR EACH ROW EXECUTE FUNCTION public.touch_feature_flag_updated_at();

DROP TRIGGER IF EXISTS feature_flag_profile_overrides_touch_updated_at
ON public.feature_flag_profile_overrides;
CREATE TRIGGER feature_flag_profile_overrides_touch_updated_at
BEFORE UPDATE ON public.feature_flag_profile_overrides
FOR EACH ROW EXECUTE FUNCTION public.touch_feature_flag_updated_at();

DROP FUNCTION IF EXISTS public.get_fursuit_detail(uuid);
CREATE OR REPLACE FUNCTION public.get_fursuit_detail(p_fursuit_id uuid)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  name text,
  species_id uuid,
  avatar_path text,
  avatar_url text,
  description text,
  unique_code text,
  visibility_audience text,
  owner_attribution_visibility text,
  catch_count integer,
  created_at timestamp with time zone,
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
  visible_fursuit AS (
    SELECT
      f.*,
      public.can_view_fursuit((SELECT id FROM viewer), f.id) AS can_view_suit,
      public.can_view_fursuit_owner((SELECT id FROM viewer), f.id) AS can_view_owner
    FROM public.fursuits f
    WHERE f.id = p_fursuit_id
      AND (SELECT id FROM viewer) IS NOT NULL
      AND public.can_view_fursuit((SELECT id FROM viewer), f.id)
  )
  SELECT
    f.id,
    CASE WHEN f.can_view_owner THEN f.owner_id ELSE NULL END,
    f.name,
    f.species_id,
    f.avatar_path,
    f.avatar_url,
    f.description,
    CASE WHEN f.owner_id = (SELECT id FROM viewer) THEN f.unique_code ELSE NULL END,
    f.visibility_audience,
    f.owner_attribution_visibility,
    coalesce(f.catch_count, 0),
    f.created_at,
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
  FROM visible_fursuit f
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
  ) makers ON true;
$function$;

REVOKE ALL ON FUNCTION public.get_fursuit_detail(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_fursuit_detail(uuid) TO authenticated;

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
  catch_count integer,
  created_at timestamp with time zone,
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
    coalesce(f.catch_count, 0),
    f.created_at,
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
  ORDER BY f.created_at DESC NULLS LAST, f.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_profile_fursuits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_fursuits(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_catch_detail(uuid);
CREATE OR REPLACE FUNCTION public.get_catch_detail(p_catch_id uuid)
RETURNS TABLE(catch_id uuid, caught_at timestamp with time zone, convention_id uuid, catch_number integer, catch_photo_path text, catch_photo_url text, convention jsonb, fursuit_id uuid, fursuit_redacted boolean, fursuit_owner_id uuid, fursuit_name text, species_id uuid, species_name text, fursuit_avatar_path text, fursuit_avatar_url text, fursuit_description text, fursuit_unique_code text, fursuit_visibility_audience text, fursuit_owner_attribution_visibility text, fursuit_catch_count integer, fursuit_created_at timestamp with time zone, color_assignments jsonb, fursuit_bio jsonb, owner_social_links jsonb, makers jsonb)
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
      public.can_view_fursuit_owner((SELECT id FROM viewer), c.fursuit_id) AS can_view_owner
    FROM public.catches c
    JOIN public.fursuits f ON f.id = c.fursuit_id
    WHERE c.id = p_catch_id
      AND c.status = 'ACCEPTED'
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
    CASE WHEN c.can_view_fursuit AND c.can_view_owner THEN f.owner_id ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN f.name ELSE 'Unavailable fursuit' END,
    CASE WHEN c.can_view_fursuit THEN f.species_id ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN fs.name ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN f.avatar_path ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN f.avatar_url ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN f.description ELSE NULL END,
    CASE WHEN c.can_view_fursuit AND f.owner_id = (SELECT id FROM viewer) THEN f.unique_code ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN f.visibility_audience ELSE 'everyone' END,
    CASE WHEN c.can_view_fursuit THEN f.owner_attribution_visibility ELSE 'public' END,
    CASE WHEN c.can_view_fursuit THEN coalesce(f.catch_count, 0) ELSE 0 END,
    CASE WHEN c.can_view_fursuit THEN f.created_at ELSE NULL END,
    CASE WHEN c.can_view_fursuit THEN coalesce(colors.data, '[]'::jsonb) ELSE '[]'::jsonb END,
    CASE
      WHEN NOT c.can_view_fursuit OR bio.data IS NULL THEN NULL
      WHEN c.can_view_owner THEN bio.data
      ELSE bio.data - 'owner_name' || jsonb_build_object('owner_name', NULL)
    END,
    CASE WHEN c.can_view_fursuit AND c.can_view_owner THEN coalesce(owner_profile.social_links, '[]'::jsonb) ELSE '[]'::jsonb END,
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
        'color', jsonb_build_object('id', fc.id, 'name', fc.name, 'normalized_name', fc.normalized_name)
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

DROP FUNCTION IF EXISTS public.get_my_caught_suits();
CREATE OR REPLACE FUNCTION public.get_my_caught_suits()
RETURNS TABLE(catch_id uuid, caught_at timestamp with time zone, convention_id uuid, catch_number integer, catch_photo_path text, catch_photo_url text, convention jsonb, fursuit_id uuid, fursuit_redacted boolean, fursuit_owner_id uuid, fursuit_name text, species_id uuid, species_name text, fursuit_avatar_path text, fursuit_avatar_url text, fursuit_description text, fursuit_unique_code text, fursuit_visibility_audience text, fursuit_owner_attribution_visibility text, fursuit_catch_count integer, fursuit_created_at timestamp with time zone, color_assignments jsonb, fursuit_bio jsonb, owner_social_links jsonb, makers jsonb)
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
      public.can_view_fursuit_owner((SELECT id FROM viewer), c.fursuit_id) AS can_view_owner
    FROM public.catches c
    WHERE c.catcher_id = (SELECT id FROM viewer)
      AND c.status = 'ACCEPTED'
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
    CASE WHEN c.can_view_fursuit AND c.can_view_owner THEN f.owner_id ELSE NULL END AS fursuit_owner_id,
    CASE WHEN c.can_view_fursuit THEN f.name ELSE 'Unavailable fursuit' END AS fursuit_name,
    CASE WHEN c.can_view_fursuit THEN f.species_id ELSE NULL END AS species_id,
    CASE WHEN c.can_view_fursuit THEN fs.name ELSE NULL END AS species_name,
    CASE WHEN c.can_view_fursuit THEN f.avatar_path ELSE NULL END AS fursuit_avatar_path,
    CASE WHEN c.can_view_fursuit THEN f.avatar_url ELSE NULL END AS fursuit_avatar_url,
    CASE WHEN c.can_view_fursuit THEN f.description ELSE NULL END AS fursuit_description,
    CASE WHEN c.can_view_fursuit AND f.owner_id = (SELECT id FROM viewer) THEN f.unique_code ELSE NULL END AS fursuit_unique_code,
    CASE WHEN c.can_view_fursuit THEN f.visibility_audience ELSE 'everyone' END AS fursuit_visibility_audience,
    CASE WHEN c.can_view_fursuit THEN f.owner_attribution_visibility ELSE 'public' END AS fursuit_owner_attribution_visibility,
    CASE WHEN c.can_view_fursuit THEN coalesce(f.catch_count, 0) ELSE 0 END AS fursuit_catch_count,
    CASE WHEN c.can_view_fursuit THEN f.created_at ELSE NULL END AS fursuit_created_at,
    CASE WHEN c.can_view_fursuit THEN coalesce(colors.data, '[]'::jsonb) ELSE '[]'::jsonb END AS color_assignments,
    CASE
      WHEN NOT c.can_view_fursuit OR bio.data IS NULL THEN NULL
      WHEN c.can_view_owner THEN bio.data
      ELSE bio.data - 'owner_name' || jsonb_build_object('owner_name', NULL)
    END AS fursuit_bio,
    CASE WHEN c.can_view_fursuit AND c.can_view_owner THEN coalesce(owner_profile.social_links, '[]'::jsonb) ELSE '[]'::jsonb END AS owner_social_links,
    CASE WHEN c.can_view_fursuit THEN coalesce(makers.data, '[]'::jsonb) ELSE '[]'::jsonb END AS makers
  FROM visible_catches c
  LEFT JOIN public.fursuits f ON f.id = c.fursuit_id
  LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
  LEFT JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
  LEFT JOIN public.conventions conv ON conv.id = c.convention_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'position', fca.position,
        'color', jsonb_build_object('id', fc.id, 'name', fc.name, 'normalized_name', fc.normalized_name)
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
      CASE WHEN public.can_view_fursuit_owner(cu.id, f.id) THEN f.owner_id ELSE NULL END AS owner_id,
      CASE WHEN public.can_view_fursuit_owner(cu.id, f.id) THEN p.username ELSE NULL END AS owner_username,
      fs.id AS species_id,
      fs.name AS species_name,
      fc.roster_visible,
      f.owner_id AS real_owner_id
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
      AND c.convention_id = p_convention_id
    GROUP BY c.fursuit_id, c.convention_id
  )
  SELECT
    l.fursuit_id,
    l.convention_id,
    CASE WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN f.name ELSE NULL END AS fursuit_name,
    CASE WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN f.avatar_url ELSE NULL END AS fursuit_avatar_url,
    CASE WHEN public.can_view_fursuit(cu.id, l.fursuit_id) AND public.can_view_fursuit_owner(cu.id, l.fursuit_id) THEN f.owner_id ELSE NULL END AS owner_id,
    CASE WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN fs.id ELSE NULL END AS species_id,
    CASE WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN fs.name ELSE NULL END AS species_name,
    CASE WHEN public.can_view_fursuit(cu.id, l.fursuit_id) THEN colors.color_assignments ELSE '[]'::jsonb END AS color_assignments,
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
    SELECT coalesce(jsonb_agg(jsonb_build_object('position', fca.position, 'color', jsonb_build_object('id', fc.id, 'name', fc.name, 'normalized_name', fc.normalized_name)) ORDER BY fca.position ASC, fc.name ASC), '[]'::jsonb) AS color_assignments
    FROM public.fursuit_color_assignments fca
    JOIN public.fursuit_colors fc ON fc.id = fca.color_id
    WHERE fca.fursuit_id = f.id
  ) colors ON true
  WHERE NOT public.is_blocked(cu.id, f.owner_id)
  ORDER BY l.catch_count DESC, fursuit_name ASC NULLS LAST, l.fursuit_id ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_catch_detail(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_caught_suits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_convention_suit_roster(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_convention_suit_leaderboard(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_catch_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_caught_suits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_convention_suit_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_convention_suit_leaderboard(uuid) TO authenticated;


-- Keep convention recaps from attaching hidden-owner fursuits to their owners.
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
      public.can_view_fursuit_owner((SELECT profile_id FROM recap_row), lc.fursuit_id) AS can_view_owner,
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
      public.can_view_fursuit_owner((SELECT profile_id FROM recap_row), scr.fursuit_id) AS can_view_owner,
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
          'owner_id', CASE WHEN cr.can_view_fursuit AND cr.can_view_owner THEN cr.owner_id ELSE NULL END,
          'owner_username', CASE WHEN cr.can_view_fursuit AND cr.can_view_owner THEN cr.owner_username ELSE NULL END,
          'owner_name', CASE WHEN cr.can_view_fursuit AND cr.can_view_owner THEN cr.owner_name ELSE NULL END,
          'pronouns', CASE WHEN cr.can_view_fursuit THEN cr.pronouns ELSE NULL END,
          'ask_me_about', CASE WHEN cr.can_view_fursuit THEN cr.ask_me_about ELSE NULL END,
          'likes_and_interests', CASE WHEN cr.can_view_fursuit THEN cr.likes_and_interests ELSE NULL END,
          'social_links', CASE WHEN cr.can_view_fursuit AND cr.can_view_owner THEN cr.social_links ELSE '[]'::jsonb END
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

REVOKE ALL ON FUNCTION public.get_my_convention_recap_detail(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_convention_recap_detail(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
