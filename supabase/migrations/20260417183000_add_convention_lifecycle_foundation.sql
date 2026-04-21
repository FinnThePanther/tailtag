-- Phase 1 convention lifecycle foundation.
--
-- Adds explicit convention lifecycle state and a durable participant recap table.
-- Existing ended conventions are marked closed, not archived, so later closeout
-- work can generate recap rows before they become historical memories.

ALTER TABLE public.conventions
  ADD COLUMN status text NOT NULL DEFAULT 'draft',
  ADD COLUMN started_at timestamp with time zone,
  ADD COLUMN closed_at timestamp with time zone,
  ADD COLUMN archived_at timestamp with time zone,
  ADD COLUMN canceled_at timestamp with time zone,
  ADD COLUMN closeout_error text,
  ADD COLUMN closeout_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.conventions
  ADD CONSTRAINT conventions_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'live'::text, 'closed'::text, 'archived'::text, 'canceled'::text]));

ALTER TABLE public.conventions
  ADD CONSTRAINT valid_closeout_summary_json
  CHECK (jsonb_typeof(closeout_summary) = 'object'::text);

CREATE INDEX conventions_status_start_date_idx
  ON public.conventions (status, start_date);

CREATE INDEX conventions_status_end_date_idx
  ON public.conventions (status, end_date);

WITH classified AS (
  SELECT
    c.id,
    COALESCE(NULLIF(c.timezone, ''), 'UTC') AS convention_timezone,
    info.local_day,
    CASE
      WHEN c.end_date IS NOT NULL AND info.local_day > c.end_date THEN 'closed'
      WHEN c.start_date IS NOT NULL AND info.local_day < c.start_date THEN 'scheduled'
      WHEN c.start_date IS NOT NULL
        AND info.local_day >= c.start_date
        AND (c.end_date IS NULL OR info.local_day <= c.end_date)
        THEN 'live'
      ELSE 'draft'
    END AS next_status
  FROM public.conventions c
  CROSS JOIN LATERAL (
    SELECT timezone(COALESCE(NULLIF(c.timezone, ''), 'UTC'), now())::date AS local_day
  ) info
)
UPDATE public.conventions c
SET
  status = classified.next_status,
  started_at = CASE
    WHEN classified.next_status = 'live' AND c.started_at IS NULL AND c.start_date IS NOT NULL
      THEN c.start_date::timestamp AT TIME ZONE classified.convention_timezone
    ELSE c.started_at
  END,
  closed_at = CASE
    WHEN classified.next_status = 'closed' AND c.closed_at IS NULL
      THEN now()
    ELSE c.closed_at
  END
FROM classified
WHERE c.id = classified.id;

CREATE TABLE public.convention_participant_recaps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  convention_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  joined_at timestamp with time zone,
  left_at timestamp with time zone,
  final_rank integer,
  catch_count integer NOT NULL DEFAULT 0,
  fursuits_caught_count integer NOT NULL DEFAULT 0,
  unique_fursuits_caught_count integer NOT NULL DEFAULT 0,
  own_fursuits_caught_count integer NOT NULL DEFAULT 0,
  unique_catchers_for_own_fursuits_count integer NOT NULL DEFAULT 0,
  daily_tasks_completed_count integer NOT NULL DEFAULT 0,
  achievements_unlocked_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.convention_participant_recaps ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX convention_participant_recaps_convention_profile_key
  ON public.convention_participant_recaps (convention_id, profile_id);

CREATE INDEX convention_participant_recaps_profile_generated_idx
  ON public.convention_participant_recaps (profile_id, generated_at DESC);

CREATE INDEX convention_participant_recaps_convention_rank_idx
  ON public.convention_participant_recaps (convention_id, final_rank)
  WHERE final_rank IS NOT NULL;

ALTER TABLE public.convention_participant_recaps
  ADD CONSTRAINT convention_participant_recaps_pkey
  PRIMARY KEY (id);

ALTER TABLE public.convention_participant_recaps
  ADD CONSTRAINT convention_participant_recaps_convention_profile_key
  UNIQUE USING INDEX convention_participant_recaps_convention_profile_key;

ALTER TABLE public.convention_participant_recaps
  ADD CONSTRAINT convention_participant_recaps_convention_id_fkey
  FOREIGN KEY (convention_id) REFERENCES public.conventions(id) ON DELETE CASCADE;

ALTER TABLE public.convention_participant_recaps
  ADD CONSTRAINT convention_participant_recaps_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.convention_participant_recaps
  ADD CONSTRAINT convention_participant_recaps_final_rank_check
  CHECK (final_rank IS NULL OR final_rank > 0);

ALTER TABLE public.convention_participant_recaps
  ADD CONSTRAINT convention_participant_recaps_counts_check
  CHECK (
    catch_count >= 0
    AND fursuits_caught_count >= 0
    AND unique_fursuits_caught_count >= 0
    AND own_fursuits_caught_count >= 0
    AND unique_catchers_for_own_fursuits_count >= 0
    AND daily_tasks_completed_count >= 0
    AND achievements_unlocked_count >= 0
  );

ALTER TABLE public.convention_participant_recaps
  ADD CONSTRAINT convention_participant_recaps_summary_json_check
  CHECK (jsonb_typeof(summary) = 'object'::text);

CREATE TRIGGER set_convention_participant_recaps_updated_at
  BEFORE UPDATE ON public.convention_participant_recaps
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

GRANT SELECT ON TABLE public.convention_participant_recaps TO authenticated;
GRANT ALL ON TABLE public.convention_participant_recaps TO service_role;

CREATE POLICY "Users can read their own convention recaps"
  ON public.convention_participant_recaps
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (profile_id = (SELECT auth.uid()));

CREATE POLICY "Service role can manage convention recaps"
  ON public.convention_participant_recaps
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
