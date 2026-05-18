-- Align the database insert guard with the app's beta fursuit limit.

DROP POLICY IF EXISTS "Users can insert their own fursuits with limit"
  ON public.fursuits;

CREATE POLICY "Users can insert their own fursuits with limit"
ON public.fursuits
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND coalesce(is_tutorial, false) = false
  AND public.count_user_fursuits(auth.uid()) < 5
);
