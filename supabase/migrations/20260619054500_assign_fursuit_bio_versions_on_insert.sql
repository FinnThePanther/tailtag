CREATE OR REPLACE FUNCTION public.assign_fursuit_bio_insert_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.fursuit_id::text, 0));

  SELECT coalesce(max(fb.version), 0) + 1
  INTO NEW.version
  FROM public.fursuit_bios fb
  WHERE fb.fursuit_id = NEW.fursuit_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assign_fursuit_bio_insert_version ON public.fursuit_bios;
CREATE TRIGGER assign_fursuit_bio_insert_version
BEFORE INSERT ON public.fursuit_bios
FOR EACH ROW EXECUTE FUNCTION public.assign_fursuit_bio_insert_version();
