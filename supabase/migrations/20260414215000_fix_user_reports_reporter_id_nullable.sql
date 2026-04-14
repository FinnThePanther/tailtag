-- reporter_id has ON DELETE SET NULL on its FK but the column was NOT NULL,
-- causing account deletion to fail with a not-null constraint violation.
-- Make reporter_id nullable so deleted reporters' reports are preserved for moderation.
ALTER TABLE public.user_reports ALTER COLUMN reporter_id DROP NOT NULL;
-- noop: trigger staging backend deploy
