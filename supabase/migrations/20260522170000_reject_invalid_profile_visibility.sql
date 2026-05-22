-- Reject invalid adults-only profile visibility changes instead of silently
-- normalizing them back to everyone.

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
    AND NEW.is_adult = true
    AND NEW.age_confirmed_at IS NULL THEN
    NEW.age_confirmed_at := now();
  ELSIF TG_OP = 'UPDATE'
    AND NEW.is_adult IS DISTINCT FROM OLD.is_adult
    AND NEW.is_adult = true
    AND NEW.age_confirmed_at IS NOT DISTINCT FROM OLD.age_confirmed_at THEN
    NEW.age_confirmed_at := now();
  END IF;

  IF coalesce(NEW.is_adult, false) = false THEN
    IF NEW.visibility_audience = 'adults_only' THEN
      IF TG_OP = 'UPDATE'
        AND OLD.is_adult = true
        AND NEW.is_adult IS DISTINCT FROM OLD.is_adult THEN
        NEW.visibility_audience := 'everyone';
      ELSE
        RAISE EXCEPTION 'Adult confirmation is required for adults-only profile visibility'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    NEW.visibility_audience := 'everyone';
  END IF;

  RETURN NEW;
END;
$function$;
