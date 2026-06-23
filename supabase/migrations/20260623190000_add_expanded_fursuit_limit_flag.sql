-- TAILTAG-155: gate expanded fursuit account limits behind a feature flag.

INSERT INTO public.feature_flags (key, description, enabled, rollout_percentage)
VALUES (
  'expanded_fursuit_limit',
  'Allow selected players to add more fursuits to their account.',
  false,
  0
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_fursuit_limit_for_profile(p_profile_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN coalesce(
      public.is_feature_enabled_for_profile('expanded_fursuit_limit', p_profile_id),
      false
    )
      THEN 25
    ELSE 5
  END;
$function$;

REVOKE ALL ON FUNCTION public.get_fursuit_limit_for_profile(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_fursuit_limit_for_profile(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_fursuit_insert_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner_id uuid := NEW.owner_id;
  v_limit integer;
  v_current_count integer;
BEGIN
  IF v_owner_id IS NULL THEN
    v_owner_id := auth.uid();
    NEW.owner_id := v_owner_id;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Fursuit owner is required'
      USING ERRCODE = '23502';
  END IF;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
    AND v_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Users can only create fursuits for their own profile'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('fursuit-limit:' || v_owner_id::text, 0)
  );

  v_limit := public.get_fursuit_limit_for_profile(v_owner_id);
  v_current_count := public.count_user_fursuits(v_owner_id);

  IF v_current_count >= v_limit THEN
    RAISE EXCEPTION 'Fursuit limit reached'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fursuits_enforce_insert_limit ON public.fursuits;
CREATE TRIGGER fursuits_enforce_insert_limit
BEFORE INSERT
ON public.fursuits
FOR EACH ROW
EXECUTE FUNCTION public.enforce_fursuit_insert_limit();

DROP POLICY IF EXISTS "Users can insert their own fursuits with limit"
  ON public.fursuits;

CREATE POLICY "Users can insert their own fursuits with limit"
ON public.fursuits
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
);

NOTIFY pgrst, 'reload schema';
