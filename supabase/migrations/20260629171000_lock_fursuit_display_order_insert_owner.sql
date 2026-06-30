CREATE OR REPLACE FUNCTION public.set_new_fursuit_display_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NEW.display_order IS NULL THEN
    PERFORM 1
    FROM public.profiles p
    WHERE p.id = NEW.owner_id
    FOR UPDATE;

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

NOTIFY pgrst, 'reload schema';
