-- Avoid calling is_elevated_privacy_viewer directly from fursuits RLS.
-- That helper is intentionally not executable by authenticated clients, so
-- direct policy usage causes normal owner reads to fail with permission denied.

DROP POLICY IF EXISTS "fursuits_select_owner_or_moderation" ON public.fursuits;

CREATE POLICY "fursuits_select_owner_or_moderation"
ON public.fursuits
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR public.get_user_role(auth.uid()) IN ('owner', 'moderator')
);

NOTIFY pgrst, 'reload schema';
