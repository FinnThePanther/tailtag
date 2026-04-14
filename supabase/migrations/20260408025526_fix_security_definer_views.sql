-- Ensure views use security_invoker=true so they respect the
-- querying user's permissions rather than the view creator's
ALTER VIEW public.fursuits_moderation SET (security_invoker = true);
ALTER VIEW public.mv_convention_leaderboard SET (security_invoker = true);
ALTER VIEW public.mv_fursuit_popularity SET (security_invoker = true);
