-- Keep the already-applied dev function permissions aligned with the updated
-- finalizing transition migration.

REVOKE EXECUTE ON FUNCTION public.transition_ended_conventions_to_finalizing(timestamp with time zone)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_ended_conventions_to_finalizing(timestamp with time zone)
  TO service_role;
