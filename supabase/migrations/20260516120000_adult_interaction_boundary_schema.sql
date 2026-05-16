-- Adult interaction boundary schema and reusable access helpers.
-- This migration intentionally does not wire the helpers into discovery/catch
-- RPCs yet; that enforcement is split into later PRs from the PRD.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_adult boolean,
  ADD COLUMN IF NOT EXISTS age_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS age_gate_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS visibility_audience text NOT NULL DEFAULT 'everyone';

ALTER TABLE public.fursuits
  ADD COLUMN IF NOT EXISTS visibility_audience text NOT NULL DEFAULT 'everyone';

UPDATE public.profiles
SET visibility_audience = 'everyone'
WHERE visibility_audience IS NULL
  OR visibility_audience NOT IN ('everyone', 'adults_only');

UPDATE public.fursuits
SET visibility_audience = 'everyone'
WHERE visibility_audience IS NULL
  OR visibility_audience NOT IN ('everyone', 'adults_only');

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_visibility_audience_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_visibility_audience_check
  CHECK (visibility_audience IN ('everyone', 'adults_only'));

ALTER TABLE public.fursuits
  DROP CONSTRAINT IF EXISTS fursuits_visibility_audience_check;

ALTER TABLE public.fursuits
  ADD CONSTRAINT fursuits_visibility_audience_check
  CHECK (visibility_audience IN ('everyone', 'adults_only'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_age_gate_version_positive_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_age_gate_version_positive_check
  CHECK (age_gate_version > 0);

CREATE OR REPLACE FUNCTION public.is_adult_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce((
    SELECT p.is_adult
    FROM public.profiles p
    WHERE p.id = p_profile_id
  ), false);
$function$;

CREATE OR REPLACE FUNCTION public.is_elevated_privacy_viewer(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = p_profile_id
        AND p.role IN ('owner', 'moderator')
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_view_profile(
  p_viewer_id uuid,
  p_target_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles target_profile
    WHERE target_profile.id = p_target_id
      AND (
        p_viewer_id = p_target_id
        OR public.is_elevated_privacy_viewer(p_viewer_id)
        OR target_profile.visibility_audience = 'everyone'
        OR (
          target_profile.visibility_audience = 'adults_only'
          AND public.is_adult_profile(p_viewer_id)
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_view_fursuit(
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
    JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
    WHERE f.id = p_fursuit_id
      AND (
        p_viewer_id = f.owner_id
        OR public.is_elevated_privacy_viewer(p_viewer_id)
        OR (
          owner_profile.visibility_audience = 'everyone'
          AND f.visibility_audience = 'everyone'
        )
        OR (
          (
            owner_profile.visibility_audience = 'adults_only'
            OR f.visibility_audience = 'adults_only'
          )
          AND public.is_adult_profile(p_viewer_id)
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_catch_fursuit(
  p_catcher_id uuid,
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
    WHERE f.id = p_fursuit_id
      AND f.owner_id IS DISTINCT FROM p_catcher_id
      AND public.can_view_fursuit(p_catcher_id, p_fursuit_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.normalize_profile_adult_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.age_gate_version := coalesce(NEW.age_gate_version, 1);
  NEW.visibility_audience := coalesce(NEW.visibility_audience, 'everyone');

  IF TG_OP = 'INSERT'
    AND NEW.is_adult IS NOT NULL
    AND NEW.age_confirmed_at IS NULL THEN
    NEW.age_confirmed_at := now();
  ELSIF TG_OP = 'UPDATE'
    AND NEW.is_adult IS DISTINCT FROM OLD.is_adult
    AND NEW.is_adult IS NOT NULL
    AND NEW.age_confirmed_at IS NOT DISTINCT FROM OLD.age_confirmed_at THEN
    NEW.age_confirmed_at := now();
  END IF;

  IF coalesce(NEW.is_adult, false) = false THEN
    NEW.visibility_audience := 'everyone';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS normalize_profile_adult_boundary_trigger
  ON public.profiles;

CREATE TRIGGER normalize_profile_adult_boundary_trigger
BEFORE INSERT OR UPDATE OF is_adult, age_confirmed_at, age_gate_version, visibility_audience
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.normalize_profile_adult_boundary();

CREATE OR REPLACE FUNCTION public.normalize_fursuit_adult_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.visibility_audience := coalesce(NEW.visibility_audience, 'everyone');

  IF NEW.visibility_audience = 'adults_only'
    AND public.is_adult_profile(NEW.owner_id) = false THEN
    RAISE EXCEPTION 'Adult confirmation is required for adults-only fursuits'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS normalize_fursuit_adult_boundary_trigger
  ON public.fursuits;

CREATE TRIGGER normalize_fursuit_adult_boundary_trigger
BEFORE INSERT OR UPDATE OF owner_id, visibility_audience
ON public.fursuits
FOR EACH ROW
EXECUTE FUNCTION public.normalize_fursuit_adult_boundary();

CREATE OR REPLACE FUNCTION public.normalize_fursuits_after_profile_age_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF coalesce(NEW.is_adult, false) = false
    AND OLD.is_adult IS DISTINCT FROM NEW.is_adult THEN
    UPDATE public.fursuits
    SET visibility_audience = 'everyone'
    WHERE owner_id = NEW.id
      AND visibility_audience = 'adults_only';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS normalize_fursuits_after_profile_age_change_trigger
  ON public.profiles;

CREATE TRIGGER normalize_fursuits_after_profile_age_change_trigger
AFTER UPDATE OF is_adult
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.normalize_fursuits_after_profile_age_change();

REVOKE ALL ON FUNCTION public.is_adult_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_elevated_privacy_viewer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_profile(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_fursuit(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_catch_fursuit(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.can_view_profile(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_fursuit(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_catch_fursuit(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_adult_profile(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_elevated_privacy_viewer(uuid) TO service_role;
