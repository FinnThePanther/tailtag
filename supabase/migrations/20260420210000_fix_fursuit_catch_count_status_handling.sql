-- Ensure fursuit catch_count tracks only accepted catches, including status transitions.
CREATE OR REPLACE FUNCTION public.keep_fursuit_catch_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'ACCEPTED' THEN
      UPDATE public.fursuits
      SET catch_count = catch_count + 1
      WHERE id = NEW.fursuit_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'ACCEPTED'
       AND (NEW.status <> 'ACCEPTED' OR NEW.fursuit_id <> OLD.fursuit_id) THEN
      UPDATE public.fursuits
      SET catch_count = GREATEST(catch_count - 1, 0)
      WHERE id = OLD.fursuit_id;
    END IF;

    IF NEW.status = 'ACCEPTED'
       AND (OLD.status <> 'ACCEPTED' OR NEW.fursuit_id <> OLD.fursuit_id) THEN
      UPDATE public.fursuits
      SET catch_count = catch_count + 1
      WHERE id = NEW.fursuit_id;
    END IF;

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'ACCEPTED' THEN
      UPDATE public.fursuits
      SET catch_count = GREATEST(catch_count - 1, 0)
      WHERE id = OLD.fursuit_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS update_fursuit_catch_count ON public.catches;
CREATE TRIGGER update_fursuit_catch_count
AFTER INSERT OR DELETE OR UPDATE OF fursuit_id, status ON public.catches
FOR EACH ROW
EXECUTE FUNCTION public.keep_fursuit_catch_count();

-- Repair existing counts so all read paths get accurate totals immediately.
WITH accepted_catch_counts AS (
  SELECT c.fursuit_id, COUNT(*)::integer AS accepted_count
  FROM public.catches c
  WHERE c.status = 'ACCEPTED'
  GROUP BY c.fursuit_id
)
UPDATE public.fursuits f
SET catch_count = COALESCE(acc.accepted_count, 0)
FROM accepted_catch_counts acc
WHERE f.id = acc.fursuit_id
  AND f.catch_count IS DISTINCT FROM COALESCE(acc.accepted_count, 0);

UPDATE public.fursuits f
SET catch_count = 0
WHERE f.catch_count <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.catches c
    WHERE c.fursuit_id = f.id
      AND c.status = 'ACCEPTED'
  );
