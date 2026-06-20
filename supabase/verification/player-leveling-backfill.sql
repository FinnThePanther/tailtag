-- Player leveling historical backfill verification.
--
-- Run after applying the PR 4 migration and executing:
--   select * from public.run_player_leveling_backfill();
--
-- Expected state:
--   - preview_player_leveling_backfill() reports zero would-award candidates
--   - player_progress totals match the player_xp_events ledger
--   - owner catch XP stays capped at 5 per owner/fursuit/convention/local day
--   - no user-facing level_up notifications were created by backfill rows

DO $$
DECLARE
  v_remaining_candidates bigint;
  v_progress_mismatches bigint;
  v_missing_progress bigint;
  v_duplicate_dedupe_keys bigint;
  v_owner_cap_violations bigint;
  v_backfill_level_notifications bigint;
BEGIN
  SELECT coalesce(sum(would_award_count), 0)
    INTO v_remaining_candidates
    FROM public.preview_player_leveling_backfill();

  IF v_remaining_candidates <> 0 THEN
    RAISE EXCEPTION 'Player leveling backfill still has % would-award candidates', v_remaining_candidates;
  END IF;

  WITH ledger_totals AS (
    SELECT
      pxe.user_id,
      sum(pxe.xp_amount)::integer AS total_xp
    FROM public.player_xp_events pxe
    GROUP BY pxe.user_id
  )
  SELECT count(*)
    INTO v_progress_mismatches
    FROM public.player_progress pp
    LEFT JOIN ledger_totals lt ON lt.user_id = pp.user_id
   WHERE pp.total_xp <> coalesce(lt.total_xp, 0)
      OR pp.level <> public.player_level_for_xp(pp.total_xp);

  IF v_progress_mismatches <> 0 THEN
    RAISE EXCEPTION 'Player progress mismatch count: %', v_progress_mismatches;
  END IF;

  SELECT count(*)
    INTO v_missing_progress
    FROM (
      SELECT DISTINCT pxe.user_id
      FROM public.player_xp_events pxe
    ) xp_users
    LEFT JOIN public.player_progress pp ON pp.user_id = xp_users.user_id
   WHERE pp.user_id IS NULL;

  IF v_missing_progress <> 0 THEN
    RAISE EXCEPTION 'Users with XP ledger rows but no progress row: %', v_missing_progress;
  END IF;

  SELECT count(*)
    INTO v_duplicate_dedupe_keys
    FROM (
      SELECT pxe.user_id, pxe.dedupe_key
      FROM public.player_xp_events pxe
      GROUP BY pxe.user_id, pxe.dedupe_key
      HAVING count(*) > 1
    ) duplicates;

  IF v_duplicate_dedupe_keys <> 0 THEN
    RAISE EXCEPTION 'Duplicate player XP dedupe keys found: %', v_duplicate_dedupe_keys;
  END IF;

  SELECT count(*)
    INTO v_owner_cap_violations
    FROM (
      SELECT
        pxe.user_id,
        pxe.metadata->>'fursuit_id' AS fursuit_id,
        coalesce(pxe.metadata->>'convention_id', '') AS convention_id,
        pxe.metadata->>'local_day' AS local_day,
        count(*) AS award_count
      FROM public.player_xp_events pxe
      WHERE pxe.reason = 'owned_fursuit_caught'
      GROUP BY
        pxe.user_id,
        pxe.metadata->>'fursuit_id',
        coalesce(pxe.metadata->>'convention_id', ''),
        pxe.metadata->>'local_day'
      HAVING count(*) > 5
    ) violations;

  IF v_owner_cap_violations <> 0 THEN
    RAISE EXCEPTION 'Owned-fursuit XP cap violations found: %', v_owner_cap_violations;
  END IF;

  SELECT count(*)
    INTO v_backfill_level_notifications
    FROM public.notifications n
    WHERE n.type = 'level_up'
      AND n.payload->>'source_event_id' IS NULL;

  IF v_backfill_level_notifications <> 0 THEN
    RAISE EXCEPTION 'Level-up notifications without source_event_id found: %', v_backfill_level_notifications;
  END IF;
END;
$$;

SELECT
  reason,
  count(*) AS xp_event_count,
  sum(xp_amount) AS total_xp,
  count(*) FILTER (WHERE metadata->>'backfilled' = 'true') AS backfilled_event_count,
  sum(xp_amount) FILTER (WHERE metadata->>'backfilled' = 'true') AS backfilled_xp
FROM public.player_xp_events
GROUP BY reason
ORDER BY reason;

SELECT *
FROM public.preview_player_leveling_backfill()
ORDER BY reason;

SELECT
  p.username,
  p.role,
  pp.level,
  pp.total_xp,
  public.player_level_for_xp(pp.total_xp) AS computed_level,
  count(pxe.id) AS xp_event_count
FROM public.player_progress pp
JOIN public.profiles p ON p.id = pp.user_id
LEFT JOIN public.player_xp_events pxe ON pxe.user_id = pp.user_id
GROUP BY p.username, p.role, pp.level, pp.total_xp
ORDER BY pp.total_xp DESC, p.username ASC NULLS LAST
LIMIT 20;

SELECT
  p.username,
  p.role,
  pp.level,
  pp.total_xp,
  (
    SELECT count(*)
    FROM public.player_xp_events user_events
    WHERE user_events.user_id = p.id
  ) AS xp_event_count,
  (
    SELECT coalesce(
      jsonb_object_agg(reason_counts.reason, reason_counts.event_count ORDER BY reason_counts.reason),
      '{}'::jsonb
    )
    FROM (
      SELECT
        user_events.reason,
        count(*) AS event_count
      FROM public.player_xp_events user_events
      WHERE user_events.user_id = p.id
      GROUP BY user_events.reason
    ) reason_counts
  ) AS xp_events_by_reason
FROM public.profiles p
LEFT JOIN public.player_progress pp ON pp.user_id = p.id
WHERE lower(p.username) = lower('FinnThePanther')
GROUP BY p.id, p.username, p.role, pp.level, pp.total_xp;

SELECT
  p.username,
  pxe.metadata->>'fursuit_id' AS fursuit_id,
  coalesce(pxe.metadata->>'convention_id', '') AS convention_id,
  pxe.metadata->>'local_day' AS local_day,
  count(*) AS owner_xp_awards
FROM public.player_xp_events pxe
JOIN public.profiles p ON p.id = pxe.user_id
WHERE pxe.reason = 'owned_fursuit_caught'
GROUP BY
  p.username,
  pxe.metadata->>'fursuit_id',
  coalesce(pxe.metadata->>'convention_id', ''),
  pxe.metadata->>'local_day'
ORDER BY owner_xp_awards DESC, p.username ASC NULLS LAST
LIMIT 20;
