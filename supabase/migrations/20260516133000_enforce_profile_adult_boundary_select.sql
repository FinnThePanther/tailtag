-- Enforce profile-level adult interaction boundaries on direct profile reads.
-- Later PRs wire the same helpers into fursuit, catch, discovery, and leaderboard surfaces.

DROP POLICY IF EXISTS "profiles_select_consolidated" ON public.profiles;

CREATE POLICY "profiles_select_consolidated"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.can_view_profile(auth.uid(), id));
