CREATE OR REPLACE FUNCTION public.register_push_token(
  p_user_id uuid,
  p_expo_push_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_effective_user uuid := COALESCE(p_user_id, auth.uid());
  v_token text := NULLIF(btrim(p_expo_push_token), '');
BEGIN
  IF v_effective_user IS NULL THEN
    RAISE EXCEPTION 'Missing authenticated user.';
  END IF;

  IF auth.uid() IS DISTINCT FROM v_effective_user THEN
    RAISE EXCEPTION 'You can only register push notifications for yourself.';
  END IF;

  IF v_token IS NULL THEN
    RAISE EXCEPTION 'Missing Expo push token.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_token, 0));

  INSERT INTO public.profiles (id)
  VALUES (v_effective_user)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
  SET
    expo_push_token = NULL,
    push_notifications_enabled = false,
    updated_at = now()
  WHERE expo_push_token = v_token
    AND id <> v_effective_user;

  UPDATE public.profiles
  SET
    expo_push_token = v_token,
    push_notifications_enabled = true,
    updated_at = now()
  WHERE id = v_effective_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile % could not be updated for push registration.', v_effective_user;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_push_token(uuid, text)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.register_push_token(uuid, text)
  TO authenticated, service_role;
