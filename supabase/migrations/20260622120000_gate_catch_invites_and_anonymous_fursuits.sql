-- Gate invite-catch creation and enforce anonymous fursuits server-side.

INSERT INTO public.feature_flags (key, description, enabled, rollout_percentage)
VALUES (
  'catch_invites',
  'Allow selected players to create invite catches for fursuits that are not on TailTag yet.',
  false,
  0
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_anonymous_fursuit_feature_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     AND NEW.owner_attribution_visibility = 'hidden'
     AND NOT coalesce(
       public.is_feature_enabled_for_profile('anonymous_fursuits', NEW.owner_id),
       false
     ) THEN
    RAISE EXCEPTION 'Anonymous fursuits are not available for this profile';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.owner_attribution_visibility = 'hidden'
     AND coalesce(OLD.owner_attribution_visibility, 'public') <> 'hidden'
     AND NOT coalesce(
       public.is_feature_enabled_for_profile('anonymous_fursuits', NEW.owner_id),
       false
     ) THEN
    RAISE EXCEPTION 'Anonymous fursuits are not available for this profile';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fursuits_enforce_anonymous_feature_flag ON public.fursuits;
CREATE TRIGGER fursuits_enforce_anonymous_feature_flag
BEFORE INSERT OR UPDATE OF owner_attribution_visibility
ON public.fursuits
FOR EACH ROW
EXECUTE FUNCTION public.enforce_anonymous_fursuit_feature_flag();

NOTIFY pgrst, 'reload schema';
