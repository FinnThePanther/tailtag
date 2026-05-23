WITH ranked_active_tokens AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY expo_push_token
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS active_rank
  FROM public.profiles
  WHERE expo_push_token IS NOT NULL
    AND btrim(expo_push_token) <> ''
    AND push_notifications_enabled = true
)
UPDATE public.profiles p
SET
  expo_push_token = NULL,
  push_notifications_enabled = false,
  updated_at = now()
FROM ranked_active_tokens ranked
WHERE p.id = ranked.id
  AND ranked.active_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_active_expo_push_token_once_idx
  ON public.profiles (expo_push_token)
  WHERE expo_push_token IS NOT NULL
    AND btrim(expo_push_token) <> ''
    AND push_notifications_enabled = true;

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
    RAISE EXCEPTION 'Profile % not found.', v_effective_user;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_push_token(uuid, text)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.register_push_token(uuid, text)
  TO authenticated, service_role;
