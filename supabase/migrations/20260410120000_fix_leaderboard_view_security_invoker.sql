-- Fix catchers leaderboard only showing the logged-in user.
--
-- Root cause: mv_convention_leaderboard is a security-invoker view, so RLS
-- on 'catches' (SELECT restricted to catcher_id = auth.uid()) and 'profiles'
-- (SELECT restricted to id = auth.uid()) filtered the join down to a single
-- row — the current user's own data.
--
-- Fix: recreate the view with security_invoker = false so it runs as the
-- view owner and bypasses RLS. Safe to do because the view only exposes
-- aggregated catch counts and public usernames, not raw catch rows.

CREATE OR REPLACE VIEW mv_convention_leaderboard
WITH (security_invoker = false)
AS
SELECT
    c.catcher_id,
    c.convention_id,
    p.username,
    count(*) AS catch_count,
    count(DISTINCT c.fursuit_id) AS unique_fursuits,
    count(DISTINCT f.species_id) AS unique_species,
    max(c.caught_at) AS last_catch_at,
    min(c.caught_at) AS first_catch_at
FROM catches c
JOIN profiles p ON p.id = c.catcher_id
LEFT JOIN fursuits f ON f.id = c.fursuit_id
WHERE c.status = 'ACCEPTED'
  AND c.is_tutorial = false
GROUP BY c.catcher_id, c.convention_id, p.username;
