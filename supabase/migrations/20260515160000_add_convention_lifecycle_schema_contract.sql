-- Phase 1.1 convention ending lifecycle schema contract.
--
-- This migration expands the lifecycle vocabulary and adds closeout tracking
-- fields without changing the current closeout runtime behavior.

ALTER TABLE public.conventions
  DROP CONSTRAINT IF EXISTS conventions_status_check;

ALTER TABLE public.conventions
  ADD CONSTRAINT conventions_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'draft'::text,
        'scheduled'::text,
        'live'::text,
        'finalizing'::text,
        'closeout_running'::text,
        'closeout_failed'::text,
        'closed'::text,
        'archived'::text,
        'canceled'::text
      ]
    )
  );

ALTER TABLE public.conventions
  ADD COLUMN IF NOT EXISTS finalizing_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS closeout_not_before timestamp with time zone,
  ADD COLUMN IF NOT EXISTS closeout_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS closeout_completed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS closeout_last_attempt_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS closeout_step text,
  ADD COLUMN IF NOT EXISTS closeout_retry_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.conventions
  ADD CONSTRAINT conventions_closeout_retry_count_check
  CHECK (closeout_retry_count >= 0);

ALTER TABLE public.conventions
  ADD CONSTRAINT conventions_closeout_step_check
  CHECK (
    closeout_step IS NULL
    OR closeout_step = ANY (
      ARRAY[
        'pending_expired'::text,
        'gameplay_queue_drained'::text,
        'recaps_generated'::text,
        'notifications_created'::text,
        'archived'::text
      ]
    )
  );

CREATE INDEX IF NOT EXISTS conventions_status_closeout_not_before_idx
  ON public.conventions (status, closeout_not_before);

CREATE INDEX IF NOT EXISTS conventions_status_closeout_last_attempt_idx
  ON public.conventions (status, closeout_last_attempt_at);

CREATE OR REPLACE FUNCTION public.calculate_convention_closeout_not_before(
  p_end_date date,
  p_timezone text
)
RETURNS timestamp with time zone
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_timezone text := COALESCE(NULLIF(btrim(p_timezone), ''), 'UTC');
  v_local_closeout timestamp without time zone;
BEGIN
  IF p_end_date IS NULL THEN
    RETURN NULL;
  END IF;

  v_local_closeout := (p_end_date + 3)::timestamp + time '09:00';

  BEGIN
    RETURN v_local_closeout AT TIME ZONE v_timezone;
  EXCEPTION
    WHEN invalid_parameter_value THEN
      RETURN v_local_closeout AT TIME ZONE 'UTC';
  END;
END;
$$;

COMMENT ON COLUMN public.conventions.finalizing_started_at IS
  'Timestamp when the convention entered the player-visible finalizing window.';
COMMENT ON COLUMN public.conventions.closeout_not_before IS
  'Earliest timestamp at which automated closeout may begin.';
COMMENT ON COLUMN public.conventions.closeout_started_at IS
  'Timestamp when the current or most recent closeout attempt started.';
COMMENT ON COLUMN public.conventions.closeout_completed_at IS
  'Timestamp when closeout completed successfully.';
COMMENT ON COLUMN public.conventions.closeout_last_attempt_at IS
  'Timestamp for the most recent closeout attempt, including failed attempts.';
COMMENT ON COLUMN public.conventions.closeout_step IS
  'Last completed or currently tracked closeout step for resumable processing.';
COMMENT ON COLUMN public.conventions.closeout_retry_count IS
  'Number of closeout retries attempted for the current failed closeout state.';
COMMENT ON FUNCTION public.calculate_convention_closeout_not_before(date, text) IS
  'Calculates the closeout deadline as two full local days after end_date, followed by 9:00 AM local time.';
