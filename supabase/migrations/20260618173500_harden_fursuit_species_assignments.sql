REVOKE REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.fursuit_species_assignments FROM anon;
REVOKE REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.fursuit_species_assignments FROM authenticated;

CREATE OR REPLACE FUNCTION public.replace_fursuit_species_assignments(
  p_fursuit_id uuid,
  p_species_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  species_count integer;
  species_id uuid;
  position_index integer := 1;
BEGIN
  IF p_fursuit_id IS NULL THEN
    RAISE EXCEPTION 'Fursuit ID is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO species_count
  FROM unnest(p_species_ids) AS selected_species(species_id);

  IF species_count < 1 OR species_count > 5 THEN
    RAISE EXCEPTION 'A fursuit must have between one and five species.'
      USING ERRCODE = '23514';
  END IF;

  IF (
    SELECT count(DISTINCT selected_species.species_id)
    FROM unnest(p_species_ids) AS selected_species(species_id)
  ) <> species_count THEN
    RAISE EXCEPTION 'Fursuit species assignments must be unique.'
      USING ERRCODE = '23505';
  END IF;

  IF (SELECT auth.role()) <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.fursuits f
      WHERE f.id = p_fursuit_id
        AND f.owner_id = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'Not allowed to update species for this fursuit.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.fursuit_species_assignments
  WHERE fursuit_id = p_fursuit_id;

  FOREACH species_id IN ARRAY p_species_ids LOOP
    INSERT INTO public.fursuit_species_assignments (fursuit_id, species_id, position)
    VALUES (p_fursuit_id, species_id, position_index);
    position_index := position_index + 1;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_fursuit_species_assignments(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_fursuit_species_assignments(uuid, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_primary_fursuit_species_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.species_id IS NOT DISTINCT FROM OLD.species_id THEN
    RETURN NEW;
  END IF;

  IF NEW.species_id IS NULL THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.fursuit_species_assignments
  WHERE fursuit_id = NEW.id;

  INSERT INTO public.fursuit_species_assignments (fursuit_id, species_id, position)
  VALUES (NEW.id, NEW.species_id, 1);

  RETURN NEW;
END;
$$;
