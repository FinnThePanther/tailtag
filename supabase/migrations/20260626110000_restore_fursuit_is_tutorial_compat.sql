ALTER TABLE public.fursuits
  ADD COLUMN IF NOT EXISTS is_tutorial boolean DEFAULT false;

COMMENT ON COLUMN public.fursuits.is_tutorial IS
  'Legacy REST compatibility shadow column. Canonical tutorial state lives in app_private.tutorial_fursuits and public.is_tutorial_fursuit(uuid).';

UPDATE public.fursuits f
SET is_tutorial = EXISTS (
  SELECT 1
  FROM app_private.tutorial_fursuits tf
  WHERE tf.fursuit_id = f.id
);

ALTER TABLE public.fursuits
  ALTER COLUMN is_tutorial SET DEFAULT false,
  ALTER COLUMN is_tutorial SET NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_fursuit_is_tutorial_shadow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO app_private, public, pg_temp
AS $function$
BEGIN
  NEW.is_tutorial := EXISTS (
    SELECT 1
    FROM app_private.tutorial_fursuits tf
    WHERE tf.fursuit_id = NEW.id
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_fursuit_is_tutorial_shadow()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_fursuit_is_tutorial_shadow
  ON public.fursuits;

CREATE TRIGGER sync_fursuit_is_tutorial_shadow
BEFORE INSERT OR UPDATE ON public.fursuits
FOR EACH ROW
EXECUTE FUNCTION public.sync_fursuit_is_tutorial_shadow();

CREATE OR REPLACE FUNCTION app_private.sync_tutorial_fursuit_shadow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO app_private, public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.fursuits
    SET is_tutorial = true
    WHERE id = NEW.fursuit_id;

    RETURN NEW;
  END IF;

  UPDATE public.fursuits
  SET is_tutorial = false
  WHERE id = OLD.fursuit_id;

  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION app_private.sync_tutorial_fursuit_shadow()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_tutorial_fursuit_shadow_insert
  ON app_private.tutorial_fursuits;
DROP TRIGGER IF EXISTS sync_tutorial_fursuit_shadow_delete
  ON app_private.tutorial_fursuits;

CREATE TRIGGER sync_tutorial_fursuit_shadow_insert
AFTER INSERT ON app_private.tutorial_fursuits
FOR EACH ROW
EXECUTE FUNCTION app_private.sync_tutorial_fursuit_shadow();

CREATE TRIGGER sync_tutorial_fursuit_shadow_delete
AFTER DELETE ON app_private.tutorial_fursuits
FOR EACH ROW
EXECUTE FUNCTION app_private.sync_tutorial_fursuit_shadow();

NOTIFY pgrst, 'reload schema';
