-- Strip includeTutorialCatches from existing daily_tasks rows.
-- The seed update uses ON CONFLICT DO NOTHING, so existing rows keep the old JSON.
-- The code no longer reads this key, but removing it keeps the data clean.
-- Idempotent: metadata - 'includeTutorialCatches' is a no-op if the key is absent.
UPDATE public.daily_tasks
   SET metadata = metadata - 'includeTutorialCatches'
 WHERE metadata ? 'includeTutorialCatches';
