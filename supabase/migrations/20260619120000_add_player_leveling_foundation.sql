BEGIN;

CREATE TABLE IF NOT EXISTS public.player_progress (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_level_up_at timestamp with time zone,
  CONSTRAINT player_progress_total_xp_check
    CHECK (total_xp >= 0),
  CONSTRAINT player_progress_level_check
    CHECK (level >= 1)
);

CREATE TABLE IF NOT EXISTS public.player_xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  xp_amount integer NOT NULL,
  reason text NOT NULL,
  dedupe_key text NOT NULL,
  source_event_id uuid,
  xp_before integer NOT NULL,
  xp_after integer NOT NULL,
  level_before integer NOT NULL,
  level_after integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT player_xp_events_xp_amount_check
    CHECK (xp_amount > 0),
  CONSTRAINT player_xp_events_reason_check
    CHECK (char_length(btrim(reason)) > 0),
  CONSTRAINT player_xp_events_dedupe_key_check
    CHECK (char_length(btrim(dedupe_key)) > 0),
  CONSTRAINT player_xp_events_xp_before_check
    CHECK (xp_before >= 0),
  CONSTRAINT player_xp_events_xp_after_check
    CHECK (xp_after >= xp_before),
  CONSTRAINT player_xp_events_level_before_check
    CHECK (level_before >= 1),
  CONSTRAINT player_xp_events_level_after_check
    CHECK (level_after >= level_before),
  CONSTRAINT player_xp_events_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS player_xp_events_user_dedupe_key_idx
  ON public.player_xp_events (user_id, dedupe_key);

CREATE INDEX IF NOT EXISTS player_xp_events_user_created_idx
  ON public.player_xp_events (user_id, created_at DESC);

ALTER TABLE public.player_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_xp_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.player_progress FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.player_xp_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.player_progress TO authenticated;
GRANT SELECT ON TABLE public.player_xp_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.player_progress TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.player_xp_events TO service_role;

DROP POLICY IF EXISTS "player_progress_own_select"
  ON public.player_progress;
CREATE POLICY "player_progress_own_select"
  ON public.player_progress FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "player_progress_service_role_all"
  ON public.player_progress;
CREATE POLICY "player_progress_service_role_all"
  ON public.player_progress FOR ALL TO public
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "player_xp_events_own_select"
  ON public.player_xp_events;
CREATE POLICY "player_xp_events_own_select"
  ON public.player_xp_events FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "player_xp_events_service_role_all"
  ON public.player_xp_events;
CREATE POLICY "player_xp_events_service_role_all"
  ON public.player_xp_events FOR ALL TO public
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

CREATE OR REPLACE FUNCTION public.player_level_for_xp(p_total_xp integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT floor(sqrt(greatest(coalesce(p_total_xp, 0), 0)::double precision / 100.0))::integer + 1;
$$;

CREATE OR REPLACE FUNCTION public.set_player_progress_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_player_progress_updated_at
  ON public.player_progress;
CREATE TRIGGER set_player_progress_updated_at
  BEFORE UPDATE ON public.player_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.set_player_progress_updated_at();

CREATE OR REPLACE FUNCTION public.award_player_xp_once(
  p_user_id uuid,
  p_xp_amount integer,
  p_reason text,
  p_dedupe_key text,
  p_source_event_id uuid DEFAULT NULL::uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  xp_event_id uuid,
  awarded boolean,
  user_id uuid,
  xp_amount integer,
  xp_before integer,
  xp_after integer,
  level_before integer,
  level_after integer,
  leveled_up boolean,
  levels_gained integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_dedupe_key text := nullif(btrim(coalesce(p_dedupe_key, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_progress public.player_progress%ROWTYPE;
  v_existing_event public.player_xp_events%ROWTYPE;
  v_xp_after integer;
  v_level_after integer;
  v_event_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing player user_id';
  END IF;

  IF p_xp_amount IS NULL OR p_xp_amount <= 0 THEN
    RAISE EXCEPTION 'XP amount must be positive';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'XP reason is required';
  END IF;

  IF v_dedupe_key IS NULL THEN
    RAISE EXCEPTION 'XP dedupe key is required';
  END IF;

  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'XP metadata must be a JSON object';
  END IF;

  INSERT INTO public.player_progress (
    user_id,
    total_xp,
    level
  )
  VALUES (
    p_user_id,
    0,
    1
  )
  ON CONFLICT ON CONSTRAINT player_progress_pkey DO NOTHING;

  SELECT pp.*
    INTO v_progress
    FROM public.player_progress pp
   WHERE pp.user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player progress row could not be created';
  END IF;

  SELECT pxe.*
    INTO v_existing_event
    FROM public.player_xp_events pxe
   WHERE pxe.user_id = p_user_id
     AND pxe.dedupe_key = v_dedupe_key
   LIMIT 1;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      v_existing_event.id,
      false,
      v_existing_event.user_id,
      v_existing_event.xp_amount,
      v_existing_event.xp_before,
      v_existing_event.xp_after,
      v_existing_event.level_before,
      v_existing_event.level_after,
      v_existing_event.level_after > v_existing_event.level_before,
      greatest(v_existing_event.level_after - v_existing_event.level_before, 0);
    RETURN;
  END IF;

  IF p_xp_amount > 2147483647 - v_progress.total_xp THEN
    RAISE EXCEPTION 'XP total would exceed integer limit';
  END IF;

  v_xp_after := v_progress.total_xp + p_xp_amount;
  v_level_after := public.player_level_for_xp(v_xp_after);

  INSERT INTO public.player_xp_events (
    user_id,
    xp_amount,
    reason,
    dedupe_key,
    source_event_id,
    xp_before,
    xp_after,
    level_before,
    level_after,
    metadata
  )
  VALUES (
    p_user_id,
    p_xp_amount,
    v_reason,
    v_dedupe_key,
    p_source_event_id,
    v_progress.total_xp,
    v_xp_after,
    v_progress.level,
    v_level_after,
    v_metadata
  )
  RETURNING id INTO v_event_id;

  UPDATE public.player_progress
     SET total_xp = v_xp_after,
         level = v_level_after,
         last_level_up_at = CASE
           WHEN v_level_after > v_progress.level THEN now()
           ELSE last_level_up_at
         END
   WHERE player_progress.user_id = p_user_id;

  RETURN QUERY
  SELECT
    v_event_id,
    true,
    p_user_id,
    p_xp_amount,
    v_progress.total_xp,
    v_xp_after,
    v_progress.level,
    v_level_after,
    v_level_after > v_progress.level,
    greatest(v_level_after - v_progress.level, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_player_level_summary(p_user_id uuid)
RETURNS TABLE(user_id uuid, level integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p.id AS user_id, coalesce(pp.level, 1) AS level
  FROM public.profiles p
  LEFT JOIN public.player_progress pp ON pp.user_id = p.id
  WHERE p.id = p_user_id
    AND (
      auth.role() = 'service_role'
      OR public.can_view_profile(p_viewer_id => auth.uid(), p_target_id => p_user_id)
    );
$$;

REVOKE ALL ON FUNCTION public.award_player_xp_once(uuid, integer, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_player_xp_once(uuid, integer, text, text, uuid, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_player_level_summary(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_player_level_summary(uuid)
  TO authenticated, service_role;

COMMENT ON TABLE public.player_progress IS
  'Fast-read aggregate for player leveling progress.';
COMMENT ON TABLE public.player_xp_events IS
  'Append-only ledger of idempotent player XP awards.';
COMMENT ON FUNCTION public.player_level_for_xp(integer) IS
  'Returns the player level for total XP using the V1 curve: 100 * (level - 1)^2.';
COMMENT ON FUNCTION public.award_player_xp_once(uuid, integer, text, text, uuid, jsonb) IS
  'Awards player XP once per user and dedupe key, updating progress and recording before/after ledger values atomically.';
COMMENT ON FUNCTION public.get_player_level_summary(uuid) IS
  'Returns profile-safe player leveling data for viewers allowed to see the target profile.';

COMMIT;
