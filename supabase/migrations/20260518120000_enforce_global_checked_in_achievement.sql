CREATE OR REPLACE FUNCTION app_private.normalize_achievement_identity_token(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $$
  SELECT NULLIF(
    btrim(regexp_replace(lower(btrim(COALESCE(p_value, ''))), '[^a-z0-9]+', '_', 'g'), '_'),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_checked_in_achievement_identity(
  p_key text,
  p_name text,
  p_trigger_event public.achievement_trigger_event
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'app_private', 'public', 'pg_catalog'
AS $$
  WITH tokens AS (
    SELECT
      app_private.normalize_achievement_identity_token(p_key) AS key_token,
      app_private.normalize_achievement_identity_token(p_name) AS name_token
  )
  SELECT
    p_trigger_event = 'convention.checkin'::public.achievement_trigger_event
    OR key_token IN ('explorer', 'checked_in', 'check_in', 'checkin')
    OR name_token IN ('explorer', 'checked_in', 'check_in', 'checkin')
    OR key_token LIKE '%\_checked\_in' ESCAPE '\'
    OR key_token LIKE '%\_check\_in' ESCAPE '\'
    OR key_token LIKE '%\_checkin' ESCAPE '\'
    OR name_token LIKE '%\_checked\_in' ESCAPE '\'
    OR name_token LIKE '%\_check\_in' ESCAPE '\'
    OR name_token LIKE '%\_checkin' ESCAPE '\'
  FROM tokens;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_global_checked_in_achievement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'app_private', 'public', 'pg_catalog'
AS $$
BEGIN
  IF
    NEW.convention_id IS NOT NULL
    AND NEW.is_active = true
    AND app_private.is_checked_in_achievement_identity(NEW.key, NEW.name, NEW.trigger_event)
  THEN
    RAISE EXCEPTION
      'Checked In is an account-level achievement; convention-scoped Checked In achievements are not allowed.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS achievements_enforce_global_checked_in ON public.achievements;
CREATE TRIGGER achievements_enforce_global_checked_in
  BEFORE INSERT OR UPDATE OF key, name, trigger_event, convention_id, is_active
  ON public.achievements
  FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_global_checked_in_achievement();

UPDATE public.achievements
SET is_active = false
WHERE convention_id IS NOT NULL
  AND is_active = true
  AND app_private.is_checked_in_achievement_identity(key, name, trigger_event);

COMMENT ON FUNCTION app_private.is_checked_in_achievement_identity(text, text, public.achievement_trigger_event) IS
  'Identifies Explorer / Checked In achievement identities that must remain account-level only.';
COMMENT ON TRIGGER achievements_enforce_global_checked_in ON public.achievements IS
  'Prevents active convention-scoped achievements from duplicating the global Checked In achievement.';
