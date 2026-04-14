-- Fix profiles SELECT RLS to allow any authenticated user to view any profile.
--
-- Root cause: profiles_select_consolidated only allowed a user to read their
-- own row (id = auth.uid()), plus owner/moderator roles. This caused the public
-- profile screen to return null for any profile other than your own, resulting
-- in a blank header (no username, no bio, no avatar).
--
-- Users with fursuits appeared partially visible because the fursuits query has
-- separate, permissive RLS. Users without fursuits (like johnnya) appeared
-- completely invisible.
--
-- Fix: allow any authenticated user to SELECT any profile row.

DROP POLICY IF EXISTS "profiles_select_consolidated" ON profiles;

CREATE POLICY "profiles_select_consolidated"
ON profiles FOR SELECT
TO authenticated
USING (true);
