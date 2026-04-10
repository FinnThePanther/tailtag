-- Resolve security_definer_view advisor errors for leaderboard views.
--
-- We still need complete leaderboard aggregation across catches, but
-- `security_invoker = true` causes base-table RLS to apply. To preserve
-- leaderboard behavior without exposing raw catches globally, we allow
-- catches SELECT only when the Data API request path targets these
-- leaderboard views.

CREATE POLICY catches_select_for_leaderboard_views
ON public.catches
FOR SELECT
TO public
USING (
  coalesce(current_setting('request.path', true), '') = ANY (
    ARRAY[
      'mv_convention_leaderboard',
      'mv_fursuit_popularity',
      'public.mv_convention_leaderboard',
      'public.mv_fursuit_popularity',
      '/rest/v1/mv_convention_leaderboard',
      '/rest/v1/mv_fursuit_popularity'
    ]
  )
);

ALTER VIEW public.mv_convention_leaderboard SET (security_invoker = true);
ALTER VIEW public.mv_fursuit_popularity SET (security_invoker = true);
