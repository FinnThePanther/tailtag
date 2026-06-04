-- Remove obsolete direct leaderboard views that are no longer used by the app.
-- Leaderboards are served through privacy-aware SECURITY DEFINER RPCs instead.

DROP POLICY IF EXISTS catches_select_for_leaderboard_views ON public.catches;

DROP FUNCTION IF EXISTS public.refresh_fursuit_popularity(uuid);

DROP VIEW IF EXISTS public.mv_convention_leaderboard;
DROP VIEW IF EXISTS public.mv_fursuit_popularity;

NOTIFY pgrst, 'reload schema';
