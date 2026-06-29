CREATE OR REPLACE FUNCTION public.reorder_own_fursuits(p_fursuit_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_requested_count integer;
  v_distinct_requested_count integer;
  v_owned_count integer;
BEGIN
  IF v_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to reorder fursuits'
      USING ERRCODE = '42501';
  END IF;

  IF p_fursuit_ids IS NULL THEN
    RAISE EXCEPTION 'Fursuit order is required'
      USING ERRCODE = '22004';
  END IF;

  PERFORM 1
  FROM public.profiles p
  WHERE p.id = v_viewer_id
  FOR UPDATE;

  PERFORM 1
  FROM public.fursuits f
  WHERE f.owner_id = v_viewer_id
  FOR UPDATE;

  SELECT count(*), count(DISTINCT requested.fursuit_id)
  INTO v_requested_count, v_distinct_requested_count
  FROM unnest(p_fursuit_ids) AS requested(fursuit_id);

  SELECT count(*)
  INTO v_owned_count
  FROM public.fursuits f
  WHERE f.owner_id = v_viewer_id;

  IF v_requested_count <> v_distinct_requested_count
    OR v_requested_count <> v_owned_count
    OR EXISTS (
      SELECT 1
      FROM unnest(p_fursuit_ids) AS requested(fursuit_id)
      LEFT JOIN public.fursuits f
        ON f.id = requested.fursuit_id
        AND f.owner_id = v_viewer_id
      WHERE f.id IS NULL
    )
  THEN
    RAISE EXCEPTION 'Fursuit order must include every owned fursuit exactly once'
      USING ERRCODE = '22023';
  END IF;

  WITH requested AS (
    SELECT
      fursuit_id,
      ordinality::integer - 1 AS next_display_order
    FROM unnest(p_fursuit_ids) WITH ORDINALITY AS requested(fursuit_id, ordinality)
  )
  UPDATE public.fursuits f
  SET display_order = requested.next_display_order
  FROM requested
  WHERE f.id = requested.fursuit_id
    AND f.owner_id = v_viewer_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_own_fursuits(uuid[])
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_own_fursuits(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
