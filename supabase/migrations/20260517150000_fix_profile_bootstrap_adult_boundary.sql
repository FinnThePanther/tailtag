-- Preserve new-account profile bootstrap under adult-boundary RLS.

DROP POLICY IF EXISTS "profiles_select_consolidated" ON public.profiles;

CREATE POLICY "profiles_select_consolidated"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.can_view_profile(auth.uid(), id)
);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.ensure_own_profile_exists(p_username text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profile_id uuid := auth.uid();
  v_username text := nullif(trim(both from p_username), '');
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Missing authenticated profile'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles (id, username)
  VALUES (v_profile_id, v_username)
  ON CONFLICT (id) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_own_profile_exists(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_own_profile_exists(text) TO authenticated, service_role;
