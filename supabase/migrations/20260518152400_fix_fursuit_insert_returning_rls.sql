-- Allow fursuit inserts that return the created id under adult-boundary RLS.
-- The helper-based visibility check re-queries fursuits, which can miss the
-- row being returned by INSERT ... RETURNING. Owners may always read their own
-- fursuits, so keep that path row-local for PostgREST return=representation.

DROP POLICY IF EXISTS "fursuits_select_adult_boundary" ON public.fursuits;

CREATE POLICY "fursuits_select_adult_boundary"
ON public.fursuits
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR public.can_view_fursuit(auth.uid(), id)
);
