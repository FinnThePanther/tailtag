-- Phase 1 rich convention recap detail reader.
--
-- Returns a single recap detail payload for the signed-in user when the recap
-- belongs to them and the convention is archived.

CREATE OR REPLACE FUNCTION public.get_my_convention_recap_detail(p_recap_id uuid)
RETURNS TABLE (
  recap jsonb,
  caught_fursuits jsonb,
  owned_fursuits jsonb,
  achievements jsonb,
  daily_summary jsonb,
  awards jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH recap_row AS (
    SELECT
      r.id AS recap_id,
      r.convention_id,
      r.profile_id,
      c.name AS convention_name,
      c.location,
      c.start_date,
      c.end_date,
      r.generated_at,
      r.joined_at,
      r.left_at,
      r.final_rank,
      r.catch_count,
      r.unique_fursuits_caught_count,
      r.own_fursuits_caught_count,
      r.unique_catchers_for_own_fursuits_count,
      r.daily_tasks_completed_count,
      r.achievements_unlocked_count,
      r.summary
    FROM public.convention_participant_recaps r
    JOIN public.conventions c ON c.id = r.convention_id
    WHERE r.id = p_recap_id
      AND r.profile_id = (SELECT auth.uid())
      AND c.status = 'archived'
    LIMIT 1
  ),
  recap_payload AS (
    SELECT jsonb_build_object(
      'recap_id', rr.recap_id,
      'convention_id', rr.convention_id,
      'convention_name', rr.convention_name,
      'location', rr.location,
      'start_date', rr.start_date,
      'end_date', rr.end_date,
      'generated_at', rr.generated_at,
      'joined_at', rr.joined_at,
      'left_at', rr.left_at,
      'final_rank', rr.final_rank,
      'catch_count', rr.catch_count,
      'unique_fursuits_caught_count', rr.unique_fursuits_caught_count,
      'own_fursuits_caught_count', rr.own_fursuits_caught_count,
      'unique_catchers_for_own_fursuits_count', rr.unique_catchers_for_own_fursuits_count,
      'daily_tasks_completed_count', rr.daily_tasks_completed_count,
      'achievements_unlocked_count', rr.achievements_unlocked_count
    ) AS data
    FROM recap_row rr
  ),
  live_caught AS (
    SELECT
      c.fursuit_id,
      COUNT(*)::integer AS catch_count,
      MIN(c.caught_at) AS first_caught_at,
      MAX(c.caught_at) AS most_recent_caught_at
    FROM recap_row rr
    JOIN public.catches c
      ON c.convention_id = rr.convention_id
      AND c.catcher_id = rr.profile_id
    WHERE c.status = 'ACCEPTED'
      AND c.is_tutorial = false
    GROUP BY c.fursuit_id
  ),
  live_caught_enriched AS (
    SELECT
      lc.fursuit_id,
      lc.catch_count,
      lc.first_caught_at,
      lc.most_recent_caught_at,
      f.name,
      f.avatar_url,
      fs.name AS species,
      COALESCE(colors.color_names, '[]'::jsonb) AS colors,
      f.owner_id,
      owner_profile.username AS owner_username,
      fb.owner_name,
      fb.pronouns,
      fb.ask_me_about,
      fb.likes_and_interests,
      COALESCE(fb.social_links, '[]'::jsonb) AS social_links,
      0 AS source_priority
    FROM live_caught lc
    LEFT JOIN public.fursuits f ON f.id = lc.fursuit_id
    LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
    LEFT JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
    LEFT JOIN public.fursuit_bios fb ON fb.fursuit_id = f.id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(fc.name ORDER BY fca.position) AS color_names
      FROM public.fursuit_color_assignments fca
      JOIN public.fursuit_colors fc ON fc.id = fca.color_id
      WHERE fca.fursuit_id = f.id
    ) colors ON true
  ),
  snapshot_caught_raw AS (
    SELECT
      CASE
        WHEN entry ? 'fursuit_id'
          AND COALESCE(entry ->> 'fursuit_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (entry ->> 'fursuit_id')::uuid
        ELSE NULL
      END AS fursuit_id,
      NULLIF(TRIM(entry ->> 'name'), '') AS name,
      CASE
        WHEN COALESCE(entry ->> 'catch_count', '') ~ '^[0-9]+$'
          THEN (entry ->> 'catch_count')::integer
        ELSE 0
      END AS catch_count
    FROM recap_row rr
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(rr.summary -> 'fursuits_caught') = 'array'
          THEN rr.summary -> 'fursuits_caught'
        ELSE '[]'::jsonb
      END
    ) AS entry
  ),
  snapshot_caught_enriched AS (
    SELECT
      scr.fursuit_id,
      scr.catch_count,
      NULL::timestamp with time zone AS first_caught_at,
      NULL::timestamp with time zone AS most_recent_caught_at,
      COALESCE(scr.name, f.name) AS name,
      f.avatar_url,
      fs.name AS species,
      COALESCE(colors.color_names, '[]'::jsonb) AS colors,
      f.owner_id,
      owner_profile.username AS owner_username,
      fb.owner_name,
      fb.pronouns,
      fb.ask_me_about,
      fb.likes_and_interests,
      COALESCE(fb.social_links, '[]'::jsonb) AS social_links,
      1 AS source_priority
    FROM snapshot_caught_raw scr
    LEFT JOIN public.fursuits f ON f.id = scr.fursuit_id
    LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
    LEFT JOIN public.profiles owner_profile ON owner_profile.id = f.owner_id
    LEFT JOIN public.fursuit_bios fb ON fb.fursuit_id = f.id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(fc.name ORDER BY fca.position) AS color_names
      FROM public.fursuit_color_assignments fca
      JOIN public.fursuit_colors fc ON fc.id = fca.color_id
      WHERE fca.fursuit_id = f.id
    ) colors ON true
    WHERE scr.fursuit_id IS NOT NULL
  ),
  caught_candidates AS (
    SELECT * FROM live_caught_enriched
    UNION ALL
    SELECT * FROM snapshot_caught_enriched
  ),
  caught_ranked AS (
    SELECT
      cc.*,
      ROW_NUMBER() OVER (
        PARTITION BY cc.fursuit_id
        ORDER BY cc.source_priority ASC, cc.catch_count DESC, COALESCE(LOWER(cc.name), '') ASC
      ) AS rn
    FROM caught_candidates cc
  ),
  caught_final AS (
    SELECT
      fursuit_id,
      catch_count,
      first_caught_at,
      most_recent_caught_at,
      name,
      avatar_url,
      species,
      colors,
      owner_id,
      owner_username,
      owner_name,
      pronouns,
      ask_me_about,
      likes_and_interests,
      social_links
    FROM caught_ranked
    WHERE rn = 1
  ),
  caught_payload AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'fursuit_id', cf.fursuit_id,
          'name', cf.name,
          'catch_count', cf.catch_count,
          'first_caught_at', cf.first_caught_at,
          'most_recent_caught_at', cf.most_recent_caught_at,
          'avatar_url', cf.avatar_url,
          'species', cf.species,
          'colors', cf.colors,
          'owner_id', cf.owner_id,
          'owner_username', cf.owner_username,
          'owner_name', cf.owner_name,
          'pronouns', cf.pronouns,
          'ask_me_about', cf.ask_me_about,
          'likes_and_interests', cf.likes_and_interests,
          'social_links', cf.social_links
        )
        ORDER BY cf.catch_count DESC, COALESCE(LOWER(cf.name), '') ASC
      ),
      '[]'::jsonb
    ) AS data
    FROM caught_final cf
  ),
  live_owned AS (
    SELECT
      c.fursuit_id,
      COUNT(*)::integer AS times_caught,
      COUNT(DISTINCT c.catcher_id)::integer AS unique_catchers,
      MIN(c.caught_at) AS first_caught_at,
      MAX(c.caught_at) AS most_recent_caught_at
    FROM recap_row rr
    JOIN public.catches c ON c.convention_id = rr.convention_id
    JOIN public.fursuits f ON f.id = c.fursuit_id
    WHERE c.status = 'ACCEPTED'
      AND c.is_tutorial = false
      AND f.owner_id = rr.profile_id
    GROUP BY c.fursuit_id
  ),
  live_owned_enriched AS (
    SELECT
      lo.fursuit_id,
      lo.times_caught,
      lo.unique_catchers,
      lo.first_caught_at,
      lo.most_recent_caught_at,
      f.name,
      f.avatar_url,
      fs.name AS species,
      COALESCE(colors.color_names, '[]'::jsonb) AS colors,
      0 AS source_priority
    FROM live_owned lo
    LEFT JOIN public.fursuits f ON f.id = lo.fursuit_id
    LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(fc.name ORDER BY fca.position) AS color_names
      FROM public.fursuit_color_assignments fca
      JOIN public.fursuit_colors fc ON fc.id = fca.color_id
      WHERE fca.fursuit_id = f.id
    ) colors ON true
  ),
  snapshot_owned_raw AS (
    SELECT
      CASE
        WHEN entry ? 'fursuit_id'
          AND COALESCE(entry ->> 'fursuit_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (entry ->> 'fursuit_id')::uuid
        ELSE NULL
      END AS fursuit_id,
      NULLIF(TRIM(entry ->> 'name'), '') AS name,
      CASE
        WHEN COALESCE(entry ->> 'times_caught', '') ~ '^[0-9]+$'
          THEN (entry ->> 'times_caught')::integer
        ELSE 0
      END AS times_caught,
      CASE
        WHEN COALESCE(entry ->> 'unique_catchers', '') ~ '^[0-9]+$'
          THEN (entry ->> 'unique_catchers')::integer
        ELSE 0
      END AS unique_catchers
    FROM recap_row rr
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(rr.summary -> 'own_fursuits') = 'array'
          THEN rr.summary -> 'own_fursuits'
        ELSE '[]'::jsonb
      END
    ) AS entry
  ),
  snapshot_owned_enriched AS (
    SELECT
      sor.fursuit_id,
      sor.times_caught,
      sor.unique_catchers,
      NULL::timestamp with time zone AS first_caught_at,
      NULL::timestamp with time zone AS most_recent_caught_at,
      COALESCE(sor.name, f.name) AS name,
      f.avatar_url,
      fs.name AS species,
      COALESCE(colors.color_names, '[]'::jsonb) AS colors,
      1 AS source_priority
    FROM snapshot_owned_raw sor
    LEFT JOIN public.fursuits f ON f.id = sor.fursuit_id
    LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(fc.name ORDER BY fca.position) AS color_names
      FROM public.fursuit_color_assignments fca
      JOIN public.fursuit_colors fc ON fc.id = fca.color_id
      WHERE fca.fursuit_id = f.id
    ) colors ON true
    WHERE sor.fursuit_id IS NOT NULL
  ),
  owned_candidates AS (
    SELECT * FROM live_owned_enriched
    UNION ALL
    SELECT * FROM snapshot_owned_enriched
  ),
  owned_ranked AS (
    SELECT
      oc.*,
      ROW_NUMBER() OVER (
        PARTITION BY oc.fursuit_id
        ORDER BY oc.source_priority ASC, oc.times_caught DESC, COALESCE(LOWER(oc.name), '') ASC
      ) AS rn
    FROM owned_candidates oc
  ),
  owned_final AS (
    SELECT
      fursuit_id,
      times_caught,
      unique_catchers,
      first_caught_at,
      most_recent_caught_at,
      name,
      avatar_url,
      species,
      colors
    FROM owned_ranked
    WHERE rn = 1
  ),
  owned_payload AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'fursuit_id', ofi.fursuit_id,
          'name', ofi.name,
          'times_caught', ofi.times_caught,
          'unique_catchers', ofi.unique_catchers,
          'first_caught_at', ofi.first_caught_at,
          'most_recent_caught_at', ofi.most_recent_caught_at,
          'avatar_url', ofi.avatar_url,
          'species', ofi.species,
          'colors', ofi.colors
        )
        ORDER BY ofi.times_caught DESC, COALESCE(LOWER(ofi.name), '') ASC
      ),
      '[]'::jsonb
    ) AS data
    FROM owned_final ofi
  ),
  live_achievements AS (
    SELECT
      ua.achievement_id,
      ua.unlocked_at,
      a.key,
      a.name,
      a.description,
      a.category,
      0 AS source_priority
    FROM recap_row rr
    JOIN public.user_achievements ua ON ua.user_id = rr.profile_id
    JOIN public.achievements a
      ON a.id = ua.achievement_id
      AND a.convention_id = rr.convention_id
  ),
  snapshot_achievement_ids AS (
    SELECT DISTINCT
      CASE
        WHEN COALESCE(value, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN value::uuid
        ELSE NULL
      END AS achievement_id
    FROM recap_row rr
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(rr.summary -> 'achievement_ids') = 'array'
          THEN rr.summary -> 'achievement_ids'
        ELSE '[]'::jsonb
      END
    ) AS value
  ),
  snapshot_achievements AS (
    SELECT
      sai.achievement_id,
      NULL::timestamp with time zone AS unlocked_at,
      a.key,
      a.name,
      a.description,
      a.category,
      1 AS source_priority
    FROM snapshot_achievement_ids sai
    JOIN recap_row rr ON true
    LEFT JOIN public.achievements a
      ON a.id = sai.achievement_id
      AND a.convention_id = rr.convention_id
    WHERE sai.achievement_id IS NOT NULL
  ),
  achievement_candidates AS (
    SELECT * FROM live_achievements
    UNION ALL
    SELECT * FROM snapshot_achievements
  ),
  achievement_ranked AS (
    SELECT
      ac.*,
      ROW_NUMBER() OVER (
        PARTITION BY ac.achievement_id
        ORDER BY ac.source_priority ASC, ac.unlocked_at ASC NULLS LAST
      ) AS rn
    FROM achievement_candidates ac
  ),
  achievement_final AS (
    SELECT
      achievement_id,
      unlocked_at,
      key,
      name,
      description,
      category
    FROM achievement_ranked
    WHERE rn = 1
  ),
  achievements_payload AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'achievement_id', af.achievement_id,
          'key', af.key,
          'name', af.name,
          'description', af.description,
          'category', af.category,
          'unlocked_at', af.unlocked_at
        )
        ORDER BY af.unlocked_at ASC NULLS LAST, COALESCE(LOWER(af.name), '') ASC
      ),
      '[]'::jsonb
    ) AS data
    FROM achievement_final af
  ),
  live_completed_days AS (
    SELECT
      COUNT(*)::integer AS completed_days_count,
      COALESCE(jsonb_agg(day ORDER BY day), '[]'::jsonb) AS completed_days
    FROM (
      SELECT DISTINCT udp.day
      FROM recap_row rr
      JOIN public.user_daily_progress udp
        ON udp.convention_id = rr.convention_id
        AND udp.user_id = rr.profile_id
      WHERE udp.is_completed = true
    ) completed
  ),
  summary_daily_fallback AS (
    SELECT
      CASE
        WHEN jsonb_typeof(rr.summary -> 'daily_task_days_completed') = 'number'
          THEN GREATEST((rr.summary ->> 'daily_task_days_completed')::integer, 0)
        WHEN COALESCE(rr.summary ->> 'daily_task_days_completed', '') ~ '^[0-9]+$'
          THEN GREATEST((rr.summary ->> 'daily_task_days_completed')::integer, 0)
        ELSE 0
      END AS completed_days_count
    FROM recap_row rr
  ),
  daily_summary_payload AS (
    SELECT jsonb_build_object(
      'completed_tasks_count', rr.daily_tasks_completed_count,
      'completed_days_count',
        CASE
          WHEN lcd.completed_days_count > 0 THEN lcd.completed_days_count
          ELSE sdf.completed_days_count
        END,
      'completed_days', lcd.completed_days,
      'convention_total_days',
        CASE
          WHEN rr.start_date IS NOT NULL
            AND rr.end_date IS NOT NULL
            AND rr.end_date >= rr.start_date
            THEN ((rr.end_date - rr.start_date) + 1)::integer
          ELSE NULL
        END
    ) AS data
    FROM recap_row rr
    CROSS JOIN live_completed_days lcd
    CROSS JOIN summary_daily_fallback sdf
  ),
  owned_award_metrics AS (
    SELECT COALESCE(MAX(ofi.times_caught), 0) AS max_owned_times_caught
    FROM owned_final ofi
  ),
  awards_rows AS (
    SELECT
      10 AS sort_order,
      jsonb_build_object(
        'code', 'top_10_catcher',
        'title', 'Top 10 Catcher',
        'description', 'Finished in the top 10 catchers at this convention.'
      ) AS award
    FROM recap_row rr
    WHERE rr.final_rank IS NOT NULL
      AND rr.final_rank <= 10

    UNION ALL

    SELECT
      20 AS sort_order,
      jsonb_build_object(
        'code', 'crowd_favorite',
        'title', 'Crowd Favorite',
        'description', 'One of your suits was caught at least 5 times during this convention.'
      ) AS award
    FROM owned_award_metrics oam
    WHERE oam.max_owned_times_caught >= 5

    UNION ALL

    SELECT
      30 AS sort_order,
      jsonb_build_object(
        'code', 'achievement_hunter',
        'title', 'Achievement Hunter',
        'description', 'Unlocked at least one convention achievement.'
      ) AS award
    FROM recap_row rr
    WHERE rr.achievements_unlocked_count > 0

    UNION ALL

    SELECT
      40 AS sort_order,
      jsonb_build_object(
        'code', 'daily_grinder',
        'title', 'Daily Grinder',
        'description', 'Completed at least one daily task during this convention.'
      ) AS award
    FROM recap_row rr
    WHERE rr.daily_tasks_completed_count > 0

    UNION ALL

    SELECT
      50 AS sort_order,
      jsonb_build_object(
        'code', 'suit_magnet',
        'title', 'Suit Magnet',
        'description', 'Your suits were caught at least once during this convention.'
      ) AS award
    FROM recap_row rr
    WHERE rr.own_fursuits_caught_count > 0
  ),
  awards_payload AS (
    SELECT COALESCE(jsonb_agg(ar.award ORDER BY ar.sort_order ASC), '[]'::jsonb) AS data
    FROM awards_rows ar
  )
  SELECT
    rp.data AS recap,
    cp.data AS caught_fursuits,
    op.data AS owned_fursuits,
    ap.data AS achievements,
    dsp.data AS daily_summary,
    awp.data AS awards
  FROM recap_row rr
  JOIN recap_payload rp ON true
  JOIN caught_payload cp ON true
  JOIN owned_payload op ON true
  JOIN achievements_payload ap ON true
  JOIN daily_summary_payload dsp ON true
  JOIN awards_payload awp ON true;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_convention_recap_detail(uuid) TO authenticated;
