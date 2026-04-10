-- Fix fursuit popularity leaderboard showing only catches visible to the current user.
--
-- Root cause: mv_fursuit_popularity is a security-invoker view, so RLS on
-- 'catches' filters the aggregation to only catches where catcher_id = auth.uid()
-- or where the fursuit is owned by auth.uid(). This produces an incomplete
-- leaderboard that varies per user rather than showing convention-wide totals.
--
-- Fix: recreate with security_invoker = false so the view runs as the owner
-- and bypasses RLS. Safe — only aggregated counts and public fursuit info are exposed.

CREATE OR REPLACE VIEW mv_fursuit_popularity
WITH (security_invoker = false)
AS
SELECT
    c.fursuit_id,
    c.convention_id,
    f.name AS fursuit_name,
    f.avatar_url AS fursuit_avatar_url,
    f.owner_id,
    count(*) AS catch_count,
    count(DISTINCT c.catcher_id) AS unique_catchers,
    max(c.caught_at) AS last_caught_at,
    min(c.caught_at) AS first_caught_at
FROM catches c
JOIN fursuits f ON f.id = c.fursuit_id
WHERE c.status = 'ACCEPTED'
  AND c.is_tutorial = false
GROUP BY c.fursuit_id, c.convention_id, f.name, f.avatar_url, f.owner_id;
