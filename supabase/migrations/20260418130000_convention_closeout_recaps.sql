-- Phase 5 convention closeout recap reader.
--
-- Closeout generation runs in the close-out-convention Edge Function. This
-- helper exposes archived recap summaries to the signed-in player only.

CREATE OR REPLACE FUNCTION public.get_my_convention_recaps()
RETURNS TABLE (
  recap_id uuid,
  convention_id uuid,
  convention_name text,
  location text,
  start_date date,
  end_date date,
  generated_at timestamp with time zone,
  final_rank integer,
  catch_count integer,
  unique_fursuits_caught_count integer,
  own_fursuits_caught_count integer,
  unique_catchers_for_own_fursuits_count integer,
  daily_tasks_completed_count integer,
  achievements_unlocked_count integer,
  summary jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT
    r.id AS recap_id,
    r.convention_id,
    c.name AS convention_name,
    c.location,
    c.start_date,
    c.end_date,
    r.generated_at,
    r.final_rank,
    r.catch_count,
    r.unique_fursuits_caught_count,
    r.own_fursuits_caught_count,
    r.unique_catchers_for_own_fursuits_count,
    r.daily_tasks_completed_count,
    r.achievements_unlocked_count,
    r.summary
  FROM public.convention_participant_recaps r
  JOIN public.conventions c ON c.id = r.convention_id
  WHERE r.profile_id = (SELECT auth.uid())
    AND c.status = 'archived'
  ORDER BY c.end_date DESC NULLS LAST, r.generated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_convention_recaps() TO authenticated;
