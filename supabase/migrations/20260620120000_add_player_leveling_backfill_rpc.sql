BEGIN;

CREATE OR REPLACE FUNCTION public.preview_player_leveling_backfill()
RETURNS TABLE(
  reason text,
  candidate_count bigint,
  already_awarded_count bigint,
  would_award_count bigint,
  candidate_xp bigint,
  already_awarded_xp bigint,
  would_award_xp bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH accepted_catches AS (
    SELECT
      c.id,
      c.catcher_id,
      c.fursuit_id,
      c.convention_id,
      c.caught_at,
      c.decided_at,
      coalesce(c.decided_at, c.caught_at, '1970-01-01 00:00:00+00'::timestamptz) AS occurred_at
    FROM public.catches c
    WHERE c.status = 'ACCEPTED'
  ),
  first_accepted_catches AS (
    SELECT *
    FROM (
      SELECT
        ac.*,
        row_number() OVER (
          PARTITION BY ac.catcher_id
          ORDER BY ac.occurred_at, ac.id
        ) AS catch_rank
      FROM accepted_catches ac
    ) ranked
    WHERE catch_rank = 1
  ),
  completed_daily_tasks AS (
    SELECT
      udp.user_id,
      udp.convention_id,
      udp.day,
      udp.task_id,
      udp.completed_at,
      udp.created_at,
      udp.updated_at,
      coalesce(udp.completed_at, udp.updated_at, udp.created_at, '1970-01-01 00:00:00+00'::timestamptz) AS occurred_at
    FROM public.user_daily_progress udp
    WHERE udp.is_completed = true
  ),
  daily_assignment_counts AS (
    SELECT
      da.convention_id,
      da.day,
      count(*)::integer AS assigned_count
    FROM public.daily_assignments da
    GROUP BY da.convention_id, da.day
  ),
  daily_completion_counts AS (
    SELECT
      cdt.user_id,
      cdt.convention_id,
      cdt.day,
      count(*)::integer AS completed_count,
      max(cdt.occurred_at) AS occurred_at
    FROM completed_daily_tasks cdt
    GROUP BY cdt.user_id, cdt.convention_id, cdt.day
  ),
  all_daily_complete_days AS (
    SELECT
      dcc.user_id,
      dcc.convention_id,
      dcc.day,
      dac.assigned_count,
      dcc.completed_count,
      dcc.occurred_at
    FROM daily_completion_counts dcc
    JOIN daily_assignment_counts dac
      ON dac.convention_id = dcc.convention_id
     AND dac.day = dcc.day
    WHERE dac.assigned_count > 0
      AND dcc.completed_count = dac.assigned_count
  ),
  logical_achievement_rows AS (
    SELECT
      ua.user_id,
      ua.achievement_id,
      ua.unlocked_at,
      ua.context,
      a.key AS achievement_key,
      nullif(
        btrim(
          regexp_replace(
            lower(coalesce(nullif(ua.context->>'source_achievement_key', ''), a.key)),
            '[^a-z0-9]+',
            '_',
            'g'
          ),
          '_'
        ),
        ''
      ) AS logical_key
    FROM public.user_achievements ua
    JOIN public.achievements a ON a.id = ua.achievement_id
    WHERE a.key NOT LIKE 'DAILY_TASK_%'
  ),
  logical_achievements AS (
    SELECT *
    FROM (
      SELECT
        lar.*,
        row_number() OVER (
          PARTITION BY lar.user_id, lar.logical_key
          ORDER BY lar.unlocked_at, lar.achievement_id
        ) AS achievement_rank
      FROM logical_achievement_rows lar
      WHERE lar.logical_key IS NOT NULL
    ) ranked
    WHERE achievement_rank = 1
  ),
  owned_fursuit_catches AS (
    SELECT
      ac.id AS catch_id,
      ac.catcher_id,
      f.owner_id,
      ac.fursuit_id,
      ac.convention_id,
      ac.caught_at,
      ac.decided_at,
      ac.occurred_at,
      (
        ac.occurred_at AT TIME ZONE coalesce(nullif(cv.timezone, ''), 'UTC')
      )::date AS local_day
    FROM accepted_catches ac
    JOIN public.fursuits f ON f.id = ac.fursuit_id
    LEFT JOIN public.conventions cv ON cv.id = ac.convention_id
    WHERE f.owner_id IS NOT NULL
      AND f.owner_id <> ac.catcher_id
  ),
  candidates AS (
    SELECT
      ac.catcher_id AS user_id,
      'accepted_catch'::text AS reason,
      100::integer AS xp_amount,
      'accepted-catch:' || ac.id::text AS dedupe_key,
      ac.occurred_at,
      20::integer AS priority,
      jsonb_build_object(
        'backfilled', true,
        'source_table', 'catches',
        'catch_id', ac.id,
        'fursuit_id', ac.fursuit_id,
        'convention_id', ac.convention_id,
        'caught_at', ac.caught_at,
        'decided_at', ac.decided_at
      ) AS metadata
    FROM accepted_catches ac

    UNION ALL

    SELECT
      fac.catcher_id AS user_id,
      'first_accepted_catch'::text AS reason,
      100::integer AS xp_amount,
      'first-accepted-catch'::text AS dedupe_key,
      fac.occurred_at,
      21::integer AS priority,
      jsonb_build_object(
        'backfilled', true,
        'source_table', 'catches',
        'catch_id', fac.id,
        'fursuit_id', fac.fursuit_id,
        'convention_id', fac.convention_id,
        'caught_at', fac.caught_at,
        'decided_at', fac.decided_at
      ) AS metadata
    FROM first_accepted_catches fac

    UNION ALL

    SELECT
      cdt.user_id,
      'daily_task_completed'::text AS reason,
      50::integer AS xp_amount,
      'daily-task-completed:' || cdt.convention_id::text || ':' || cdt.day::text || ':' || cdt.task_id::text AS dedupe_key,
      cdt.occurred_at,
      30::integer AS priority,
      jsonb_build_object(
        'backfilled', true,
        'source_table', 'user_daily_progress',
        'convention_id', cdt.convention_id,
        'day', cdt.day,
        'task_id', cdt.task_id,
        'completed_at', cdt.completed_at
      ) AS metadata
    FROM completed_daily_tasks cdt

    UNION ALL

    SELECT
      adcd.user_id,
      'daily_all_complete'::text AS reason,
      150::integer AS xp_amount,
      'daily-all-complete:' || adcd.convention_id::text || ':' || adcd.day::text AS dedupe_key,
      adcd.occurred_at,
      31::integer AS priority,
      jsonb_build_object(
        'backfilled', true,
        'source_table', 'user_daily_progress',
        'convention_id', adcd.convention_id,
        'day', adcd.day,
        'assigned_tasks', adcd.assigned_count,
        'completed_tasks', adcd.completed_count
      ) AS metadata
    FROM all_daily_complete_days adcd

    UNION ALL

    SELECT
      la.user_id,
      'logical_achievement_unlocked'::text AS reason,
      100::integer AS xp_amount,
      'achievement-unlocked:' || la.logical_key AS dedupe_key,
      coalesce(la.unlocked_at, '1970-01-01 00:00:00+00'::timestamptz) AS occurred_at,
      40::integer AS priority,
      jsonb_build_object(
        'backfilled', true,
        'source_table', 'user_achievements',
        'achievement_id', la.achievement_id,
        'achievement_key', la.achievement_key,
        'logical_achievement_key', la.logical_key,
        'unlocked_at', la.unlocked_at,
        'context', coalesce(la.context, '{}'::jsonb)
      ) AS metadata
    FROM logical_achievements la

    UNION ALL

    SELECT
      ofc.owner_id AS user_id,
      'owned_fursuit_caught'::text AS reason,
      25::integer AS xp_amount,
      'owned-fursuit-caught:' || ofc.catch_id::text AS dedupe_key,
      ofc.occurred_at,
      50::integer AS priority,
      jsonb_build_object(
        'backfilled', true,
        'source_table', 'catches',
        'catch_id', ofc.catch_id,
        'fursuit_id', ofc.fursuit_id,
        'convention_id', ofc.convention_id,
        'local_day', ofc.local_day,
        'daily_cap', 5,
        'caught_at', ofc.caught_at,
        'decided_at', ofc.decided_at
      ) AS metadata
    FROM owned_fursuit_catches ofc
  ),
  candidate_status AS (
    SELECT
      c.*,
      pxe.id IS NOT NULL AS already_awarded,
      CASE
        WHEN c.reason = 'owned_fursuit_caught' THEN (
          SELECT count(*)::integer
          FROM public.player_xp_events owner_pxe
          WHERE owner_pxe.user_id = c.user_id
            AND owner_pxe.reason = 'owned_fursuit_caught'
            AND owner_pxe.metadata->>'fursuit_id' = c.metadata->>'fursuit_id'
            AND coalesce(owner_pxe.metadata->>'convention_id', '') = coalesce(c.metadata->>'convention_id', '')
            AND owner_pxe.metadata->>'local_day' = c.metadata->>'local_day'
        )
        ELSE 0
      END AS existing_owner_awards
    FROM candidates c
    LEFT JOIN public.player_xp_events pxe
      ON pxe.user_id = c.user_id
     AND pxe.dedupe_key = c.dedupe_key
  ),
  candidate_decisions AS (
    SELECT
      cs.*,
      CASE
        WHEN cs.already_awarded THEN false
        WHEN cs.reason <> 'owned_fursuit_caught' THEN true
        ELSE
          cs.existing_owner_awards +
          sum(CASE WHEN cs.already_awarded THEN 0 ELSE 1 END) OVER (
            PARTITION BY
              cs.user_id,
              cs.metadata->>'fursuit_id',
              coalesce(cs.metadata->>'convention_id', ''),
              cs.metadata->>'local_day'
            ORDER BY cs.occurred_at, cs.dedupe_key
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) <= 5
      END AS would_award
    FROM candidate_status cs
  )
  SELECT
    cd.reason,
    count(*) AS candidate_count,
    count(*) FILTER (WHERE cd.already_awarded) AS already_awarded_count,
    count(*) FILTER (WHERE cd.would_award) AS would_award_count,
    coalesce(sum(cd.xp_amount), 0)::bigint AS candidate_xp,
    coalesce(sum(cd.xp_amount) FILTER (WHERE cd.already_awarded), 0)::bigint AS already_awarded_xp,
    coalesce(sum(cd.xp_amount) FILTER (WHERE cd.would_award), 0)::bigint AS would_award_xp
  FROM candidate_decisions cd
  GROUP BY cd.reason
  ORDER BY cd.reason;
$$;

CREATE OR REPLACE FUNCTION public.run_player_leveling_backfill()
RETURNS TABLE(
  reason text,
  candidate_count bigint,
  awarded_count bigint,
  skipped_count bigint,
  awarded_xp bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  candidate record;
  award_result record;
  owner_result_returned boolean;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS player_leveling_backfill_run_results (
    reason text NOT NULL,
    awarded boolean NOT NULL,
    xp_amount integer NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE player_leveling_backfill_run_results;

  FOR candidate IN
    WITH accepted_catches AS (
      SELECT
        c.id,
        c.catcher_id,
        c.fursuit_id,
        c.convention_id,
        c.caught_at,
        c.decided_at,
        coalesce(c.decided_at, c.caught_at, '1970-01-01 00:00:00+00'::timestamptz) AS occurred_at
      FROM public.catches c
      WHERE c.status = 'ACCEPTED'
    ),
    first_accepted_catches AS (
      SELECT *
      FROM (
        SELECT
          ac.*,
          row_number() OVER (
            PARTITION BY ac.catcher_id
            ORDER BY ac.occurred_at, ac.id
          ) AS catch_rank
        FROM accepted_catches ac
      ) ranked
      WHERE catch_rank = 1
    ),
    completed_daily_tasks AS (
      SELECT
        udp.user_id,
        udp.convention_id,
        udp.day,
        udp.task_id,
        udp.completed_at,
        udp.created_at,
        udp.updated_at,
        coalesce(udp.completed_at, udp.updated_at, udp.created_at, '1970-01-01 00:00:00+00'::timestamptz) AS occurred_at
      FROM public.user_daily_progress udp
      WHERE udp.is_completed = true
    ),
    daily_assignment_counts AS (
      SELECT
        da.convention_id,
        da.day,
        count(*)::integer AS assigned_count
      FROM public.daily_assignments da
      GROUP BY da.convention_id, da.day
    ),
    daily_completion_counts AS (
      SELECT
        cdt.user_id,
        cdt.convention_id,
        cdt.day,
        count(*)::integer AS completed_count,
        max(cdt.occurred_at) AS occurred_at
      FROM completed_daily_tasks cdt
      GROUP BY cdt.user_id, cdt.convention_id, cdt.day
    ),
    all_daily_complete_days AS (
      SELECT
        dcc.user_id,
        dcc.convention_id,
        dcc.day,
        dac.assigned_count,
        dcc.completed_count,
        dcc.occurred_at
      FROM daily_completion_counts dcc
      JOIN daily_assignment_counts dac
        ON dac.convention_id = dcc.convention_id
       AND dac.day = dcc.day
      WHERE dac.assigned_count > 0
        AND dcc.completed_count = dac.assigned_count
    ),
    logical_achievement_rows AS (
      SELECT
        ua.user_id,
        ua.achievement_id,
        ua.unlocked_at,
        ua.context,
        a.key AS achievement_key,
        nullif(
          btrim(
            regexp_replace(
              lower(coalesce(nullif(ua.context->>'source_achievement_key', ''), a.key)),
              '[^a-z0-9]+',
              '_',
              'g'
            ),
            '_'
          ),
          ''
        ) AS logical_key
      FROM public.user_achievements ua
      JOIN public.achievements a ON a.id = ua.achievement_id
      WHERE a.key NOT LIKE 'DAILY_TASK_%'
    ),
    logical_achievements AS (
      SELECT *
      FROM (
        SELECT
          lar.*,
          row_number() OVER (
            PARTITION BY lar.user_id, lar.logical_key
            ORDER BY lar.unlocked_at, lar.achievement_id
          ) AS achievement_rank
        FROM logical_achievement_rows lar
        WHERE lar.logical_key IS NOT NULL
      ) ranked
      WHERE achievement_rank = 1
    ),
    owned_fursuit_catches AS (
      SELECT
        ac.id AS catch_id,
        ac.catcher_id,
        f.owner_id,
        ac.fursuit_id,
        ac.convention_id,
        ac.caught_at,
        ac.decided_at,
        ac.occurred_at,
        (
          ac.occurred_at AT TIME ZONE coalesce(nullif(cv.timezone, ''), 'UTC')
        )::date AS local_day
      FROM accepted_catches ac
      JOIN public.fursuits f ON f.id = ac.fursuit_id
      LEFT JOIN public.conventions cv ON cv.id = ac.convention_id
      WHERE f.owner_id IS NOT NULL
        AND f.owner_id <> ac.catcher_id
    ),
    candidates AS (
      SELECT
        ac.catcher_id AS user_id,
        'accepted_catch'::text AS reason,
        100::integer AS xp_amount,
        'accepted-catch:' || ac.id::text AS dedupe_key,
        ac.occurred_at,
        20::integer AS priority,
        jsonb_build_object(
          'backfilled', true,
          'source_table', 'catches',
          'catch_id', ac.id,
          'fursuit_id', ac.fursuit_id,
          'convention_id', ac.convention_id,
          'caught_at', ac.caught_at,
          'decided_at', ac.decided_at
        ) AS metadata,
        NULL::uuid AS catch_id,
        NULL::uuid AS fursuit_id,
        NULL::uuid AS convention_id,
        NULL::date AS local_day
      FROM accepted_catches ac

      UNION ALL

      SELECT
        fac.catcher_id AS user_id,
        'first_accepted_catch'::text AS reason,
        100::integer AS xp_amount,
        'first-accepted-catch'::text AS dedupe_key,
        fac.occurred_at,
        21::integer AS priority,
        jsonb_build_object(
          'backfilled', true,
          'source_table', 'catches',
          'catch_id', fac.id,
          'fursuit_id', fac.fursuit_id,
          'convention_id', fac.convention_id,
          'caught_at', fac.caught_at,
          'decided_at', fac.decided_at
        ) AS metadata,
        NULL::uuid AS catch_id,
        NULL::uuid AS fursuit_id,
        NULL::uuid AS convention_id,
        NULL::date AS local_day
      FROM first_accepted_catches fac

      UNION ALL

      SELECT
        cdt.user_id,
        'daily_task_completed'::text AS reason,
        50::integer AS xp_amount,
        'daily-task-completed:' || cdt.convention_id::text || ':' || cdt.day::text || ':' || cdt.task_id::text AS dedupe_key,
        cdt.occurred_at,
        30::integer AS priority,
        jsonb_build_object(
          'backfilled', true,
          'source_table', 'user_daily_progress',
          'convention_id', cdt.convention_id,
          'day', cdt.day,
          'task_id', cdt.task_id,
          'completed_at', cdt.completed_at
        ) AS metadata,
        NULL::uuid AS catch_id,
        NULL::uuid AS fursuit_id,
        NULL::uuid AS convention_id,
        NULL::date AS local_day
      FROM completed_daily_tasks cdt

      UNION ALL

      SELECT
        adcd.user_id,
        'daily_all_complete'::text AS reason,
        150::integer AS xp_amount,
        'daily-all-complete:' || adcd.convention_id::text || ':' || adcd.day::text AS dedupe_key,
        adcd.occurred_at,
        31::integer AS priority,
        jsonb_build_object(
          'backfilled', true,
          'source_table', 'user_daily_progress',
          'convention_id', adcd.convention_id,
          'day', adcd.day,
          'assigned_tasks', adcd.assigned_count,
          'completed_tasks', adcd.completed_count
        ) AS metadata,
        NULL::uuid AS catch_id,
        NULL::uuid AS fursuit_id,
        NULL::uuid AS convention_id,
        NULL::date AS local_day
      FROM all_daily_complete_days adcd

      UNION ALL

      SELECT
        la.user_id,
        'logical_achievement_unlocked'::text AS reason,
        100::integer AS xp_amount,
        'achievement-unlocked:' || la.logical_key AS dedupe_key,
        coalesce(la.unlocked_at, '1970-01-01 00:00:00+00'::timestamptz) AS occurred_at,
        40::integer AS priority,
        jsonb_build_object(
          'backfilled', true,
          'source_table', 'user_achievements',
          'achievement_id', la.achievement_id,
          'achievement_key', la.achievement_key,
          'logical_achievement_key', la.logical_key,
          'unlocked_at', la.unlocked_at,
          'context', coalesce(la.context, '{}'::jsonb)
        ) AS metadata,
        NULL::uuid AS catch_id,
        NULL::uuid AS fursuit_id,
        NULL::uuid AS convention_id,
        NULL::date AS local_day
      FROM logical_achievements la

      UNION ALL

      SELECT
        ofc.owner_id AS user_id,
        'owned_fursuit_caught'::text AS reason,
        25::integer AS xp_amount,
        'owned-fursuit-caught:' || ofc.catch_id::text AS dedupe_key,
        ofc.occurred_at,
        50::integer AS priority,
        jsonb_build_object(
          'backfilled', true,
          'source_table', 'catches',
          'catch_id', ofc.catch_id,
          'fursuit_id', ofc.fursuit_id,
          'convention_id', ofc.convention_id,
          'local_day', ofc.local_day,
          'daily_cap', 5,
          'caught_at', ofc.caught_at,
          'decided_at', ofc.decided_at
        ) AS metadata,
        ofc.catch_id,
        ofc.fursuit_id,
        ofc.convention_id,
        ofc.local_day
      FROM owned_fursuit_catches ofc
    )
    SELECT *
    FROM candidates
    ORDER BY occurred_at, priority, user_id, dedupe_key
  LOOP
    IF candidate.reason = 'owned_fursuit_caught' THEN
      owner_result_returned := false;

      FOR award_result IN
        SELECT *
        FROM public.award_owned_fursuit_catch_xp_once(
          candidate.user_id,
          candidate.xp_amount,
          candidate.catch_id,
          candidate.fursuit_id,
          candidate.local_day,
          candidate.convention_id,
          NULL::uuid,
          candidate.metadata,
          5
        )
      LOOP
        owner_result_returned := true;

        INSERT INTO player_leveling_backfill_run_results (reason, awarded, xp_amount)
        VALUES (
          candidate.reason,
          award_result.awarded,
          CASE WHEN award_result.awarded THEN award_result.xp_amount ELSE 0 END
        );
      END LOOP;

      IF NOT owner_result_returned THEN
        INSERT INTO player_leveling_backfill_run_results (reason, awarded, xp_amount)
        VALUES (candidate.reason, false, 0);
      END IF;
    ELSE
      SELECT *
      INTO award_result
      FROM public.award_player_xp_once(
        candidate.user_id,
        candidate.xp_amount,
        candidate.reason,
        candidate.dedupe_key,
        NULL::uuid,
        candidate.metadata
      );

      INSERT INTO player_leveling_backfill_run_results (reason, awarded, xp_amount)
      VALUES (
        candidate.reason,
        award_result.awarded,
        CASE WHEN award_result.awarded THEN award_result.xp_amount ELSE 0 END
      );
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT
    results.reason,
    count(*) AS candidate_count,
    count(*) FILTER (WHERE results.awarded) AS awarded_count,
    count(*) FILTER (WHERE NOT results.awarded) AS skipped_count,
    coalesce(sum(results.xp_amount) FILTER (WHERE results.awarded), 0)::bigint AS awarded_xp
  FROM player_leveling_backfill_run_results results
  GROUP BY results.reason
  ORDER BY results.reason;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_player_leveling_backfill()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_player_leveling_backfill()
  TO service_role;

REVOKE ALL ON FUNCTION public.run_player_leveling_backfill()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_player_leveling_backfill()
  TO service_role;

COMMENT ON FUNCTION public.preview_player_leveling_backfill() IS
  'Previews historical player-leveling XP candidates and idempotency state without mutating data.';
COMMENT ON FUNCTION public.run_player_leveling_backfill() IS
  'Backfills historical player-leveling XP through live idempotent award functions without creating level-up notifications.';

COMMIT;
