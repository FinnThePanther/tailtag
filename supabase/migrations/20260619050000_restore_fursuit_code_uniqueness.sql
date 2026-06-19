DO $$
DECLARE
  v_duplicate_codes jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'code', duplicate_codes.normalized_code,
      'count', duplicate_codes.code_count,
      'fursuit_ids', duplicate_codes.fursuit_ids
    )
    ORDER BY duplicate_codes.normalized_code
  )
  INTO v_duplicate_codes
  FROM (
    SELECT
      upper(unique_code) AS normalized_code,
      count(*) AS code_count,
      array_agg(id ORDER BY created_at, id) AS fursuit_ids
    FROM public.fursuits
    GROUP BY upper(unique_code)
    HAVING count(*) > 1
  ) duplicate_codes;

  IF v_duplicate_codes IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot restore fursuit unique_code index while duplicate normalized codes exist: %',
      v_duplicate_codes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fursuits_unique_code_upper_idx
ON public.fursuits (upper(unique_code));

CREATE OR REPLACE FUNCTION public.is_fursuit_unique_code_available(
  p_unique_code text,
  p_excluding_fursuit_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.fursuits f
    WHERE upper(f.unique_code) = upper(coalesce(p_unique_code, ''))
      AND (
        p_excluding_fursuit_id IS NULL
        OR f.id <> p_excluding_fursuit_id
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.is_fursuit_unique_code_available(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_fursuit_unique_code_available(text, uuid)
  TO authenticated, service_role;
