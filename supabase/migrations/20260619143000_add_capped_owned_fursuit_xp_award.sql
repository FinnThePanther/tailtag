BEGIN;

CREATE OR REPLACE FUNCTION public.award_owned_fursuit_catch_xp_once(
  p_owner_id uuid,
  p_xp_amount integer,
  p_catch_id uuid,
  p_fursuit_id uuid,
  p_convention_id uuid,
  p_local_day date,
  p_source_event_id uuid DEFAULT NULL::uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_daily_cap integer DEFAULT 5
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
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_existing_event public.player_xp_events%ROWTYPE;
  v_existing_count integer;
  v_dedupe_key text;
  v_lock_key text;
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Missing owner user_id';
  END IF;

  IF p_xp_amount IS NULL OR p_xp_amount <= 0 THEN
    RAISE EXCEPTION 'XP amount must be positive';
  END IF;

  IF p_catch_id IS NULL THEN
    RAISE EXCEPTION 'Missing catch_id';
  END IF;

  IF p_fursuit_id IS NULL THEN
    RAISE EXCEPTION 'Missing fursuit_id';
  END IF;

  IF p_local_day IS NULL THEN
    RAISE EXCEPTION 'Missing local_day';
  END IF;

  IF p_daily_cap IS NULL OR p_daily_cap <= 0 THEN
    RAISE EXCEPTION 'Owner XP daily cap must be positive';
  END IF;

  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'XP metadata must be a JSON object';
  END IF;

  v_dedupe_key := 'owned-fursuit-caught:' || p_catch_id::text;
  v_lock_key :=
    p_owner_id::text || ':' ||
    p_fursuit_id::text || ':' ||
    coalesce(p_convention_id::text, 'no-convention') || ':' ||
    p_local_day::text;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  SELECT pxe.*
    INTO v_existing_event
    FROM public.player_xp_events pxe
   WHERE pxe.user_id = p_owner_id
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

  SELECT count(*)::integer
    INTO v_existing_count
    FROM public.player_xp_events pxe
   WHERE pxe.user_id = p_owner_id
     AND pxe.reason = 'owned_fursuit_caught'
     AND pxe.metadata->>'fursuit_id' = p_fursuit_id::text
     AND coalesce(pxe.metadata->>'convention_id', '') = coalesce(p_convention_id::text, '')
     AND pxe.metadata->>'local_day' = p_local_day::text;

  IF v_existing_count >= p_daily_cap THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
    FROM public.award_player_xp_once(
      p_owner_id,
      p_xp_amount,
      'owned_fursuit_caught',
      v_dedupe_key,
      p_source_event_id,
      v_metadata ||
        jsonb_build_object(
          'catch_id', p_catch_id,
          'fursuit_id', p_fursuit_id,
          'convention_id', p_convention_id,
          'local_day', p_local_day,
          'daily_cap', p_daily_cap
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.award_owned_fursuit_catch_xp_once(
  uuid,
  integer,
  uuid,
  uuid,
  uuid,
  date,
  uuid,
  jsonb,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_owned_fursuit_catch_xp_once(
  uuid,
  integer,
  uuid,
  uuid,
  uuid,
  date,
  uuid,
  jsonb,
  integer
) TO service_role;

COMMENT ON FUNCTION public.award_owned_fursuit_catch_xp_once(
  uuid,
  integer,
  uuid,
  uuid,
  uuid,
  date,
  uuid,
  jsonb,
  integer
) IS
  'Awards owned-fursuit catch XP once per catch, capped atomically per owner/fursuit/convention/local day.';

COMMIT;
