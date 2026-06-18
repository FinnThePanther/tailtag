CREATE TABLE IF NOT EXISTS public.fursuit_species_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fursuit_id uuid NOT NULL,
  species_id uuid NOT NULL,
  position smallint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.fursuit_species_assignments ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS fursuit_species_assignments_pkey
  ON public.fursuit_species_assignments USING btree (id);

CREATE UNIQUE INDEX IF NOT EXISTS fursuit_species_assignments_unique_species
  ON public.fursuit_species_assignments USING btree (fursuit_id, species_id);

CREATE UNIQUE INDEX IF NOT EXISTS fursuit_species_assignments_unique_position
  ON public.fursuit_species_assignments USING btree (fursuit_id, position);

CREATE INDEX IF NOT EXISTS fursuit_species_assignments_species_idx
  ON public.fursuit_species_assignments USING btree (species_id);

ALTER TABLE public.fursuit_species_assignments
  ADD CONSTRAINT fursuit_species_assignments_pkey
  PRIMARY KEY USING INDEX fursuit_species_assignments_pkey;

ALTER TABLE public.fursuit_species_assignments
  ADD CONSTRAINT fursuit_species_assignments_fursuit_id_fkey
  FOREIGN KEY (fursuit_id) REFERENCES public.fursuits(id) ON DELETE CASCADE;

ALTER TABLE public.fursuit_species_assignments
  ADD CONSTRAINT fursuit_species_assignments_species_id_fkey
  FOREIGN KEY (species_id) REFERENCES public.fursuit_species(id) ON DELETE RESTRICT;

ALTER TABLE public.fursuit_species_assignments
  ADD CONSTRAINT fursuit_species_assignments_position_check
  CHECK (position >= 1 AND position <= 5);

GRANT DELETE, INSERT, SELECT, UPDATE
  ON TABLE public.fursuit_species_assignments TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE
  ON TABLE public.fursuit_species_assignments TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.fursuit_species_assignments TO service_role;

CREATE POLICY "fursuit_species_assignments_delete"
ON public.fursuit_species_assignments
AS permissive
FOR DELETE
TO public
USING (
  (SELECT auth.role()) = 'service_role'
  OR fursuit_id IN (
    SELECT fursuits.id
    FROM public.fursuits
    WHERE fursuits.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "fursuit_species_assignments_insert"
ON public.fursuit_species_assignments
AS permissive
FOR INSERT
TO public
WITH CHECK (
  (SELECT auth.role()) = 'service_role'
  OR fursuit_id IN (
    SELECT fursuits.id
    FROM public.fursuits
    WHERE fursuits.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "fursuit_species_assignments_select_adult_boundary"
ON public.fursuit_species_assignments
FOR SELECT
TO authenticated
USING (public.can_view_fursuit(auth.uid(), fursuit_id));

CREATE POLICY "fursuit_species_assignments_update"
ON public.fursuit_species_assignments
AS permissive
FOR UPDATE
TO public
USING (
  (SELECT auth.role()) = 'service_role'
  OR fursuit_id IN (
    SELECT fursuits.id
    FROM public.fursuits
    WHERE fursuits.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  (SELECT auth.role()) = 'service_role'
  OR fursuit_id IN (
    SELECT fursuits.id
    FROM public.fursuits
    WHERE fursuits.owner_id = (SELECT auth.uid())
  )
);

INSERT INTO public.fursuit_species_assignments (fursuit_id, species_id, position)
SELECT f.id, f.species_id, 1
FROM public.fursuits f
WHERE f.species_id IS NOT NULL
ON CONFLICT (fursuit_id, species_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_fursuit_species_assignment_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_count integer;
BEGIN
  SELECT count(*)
  INTO assignment_count
  FROM public.fursuit_species_assignments
  WHERE fursuit_id = NEW.fursuit_id
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  IF assignment_count >= 5 THEN
    RAISE EXCEPTION 'A fursuit can have at most five species.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_fursuit_species_assignment_limit
BEFORE INSERT OR UPDATE ON public.fursuit_species_assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_fursuit_species_assignment_limit();

CREATE OR REPLACE FUNCTION public.sync_primary_fursuit_species_from_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_fursuit_id uuid;
  primary_species_id uuid;
BEGIN
  target_fursuit_id := COALESCE(NEW.fursuit_id, OLD.fursuit_id);

  SELECT fsa.species_id
  INTO primary_species_id
  FROM public.fursuit_species_assignments fsa
  WHERE fsa.fursuit_id = target_fursuit_id
  ORDER BY fsa.position ASC, fsa.created_at ASC, fsa.id ASC
  LIMIT 1;

  UPDATE public.fursuits
  SET species_id = primary_species_id
  WHERE id = target_fursuit_id
    AND species_id IS DISTINCT FROM primary_species_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER sync_primary_fursuit_species_from_assignments
AFTER INSERT OR UPDATE OR DELETE ON public.fursuit_species_assignments
FOR EACH ROW
EXECUTE FUNCTION public.sync_primary_fursuit_species_from_assignments();

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

CREATE TRIGGER ensure_primary_fursuit_species_assignment
AFTER INSERT OR UPDATE OF species_id ON public.fursuits
FOR EACH ROW
WHEN (NEW.species_id IS NOT NULL)
EXECUTE FUNCTION public.ensure_primary_fursuit_species_assignment();

CREATE OR REPLACE FUNCTION public.count_distinct_species_caught(user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(DISTINCT coalesce(fsa.species_id, f.species_id))::integer
  FROM public.catches c
  JOIN public.fursuits f ON f.id = c.fursuit_id
  LEFT JOIN public.fursuit_species_assignments fsa ON fsa.fursuit_id = f.id
  WHERE c.catcher_id = user_id
    AND c.status = 'ACCEPTED'
    AND coalesce(fsa.species_id, f.species_id) IS NOT NULL;
$$;
