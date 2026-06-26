CREATE OR REPLACE FUNCTION public.get_nearby_convention_setup_reminder(
  p_lat double precision,
  p_lng double precision,
  p_accuracy_meters integer DEFAULT NULL::integer
)
RETURNS TABLE (
  convention_id uuid,
  convention_name text,
  distance_meters double precision,
  action text,
  membership_state text,
  owned_suit_count integer,
  rostered_owned_suit_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  WITH current_profile AS (
    SELECT p.id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.nearby_convention_reminders_enabled = true
  ),
  owned_suits AS (
    SELECT count(*)::integer AS owned_suit_count
    FROM public.fursuits f
    JOIN current_profile cp ON cp.id = f.owner_id
  ),
  raw_candidates AS (
    SELECT
      c.id AS convention_id,
      c.name AS convention_name,
      extensions.st_distancesphere(
        extensions.st_makepoint(p_lng, p_lat),
        extensions.st_makepoint(c.longitude, c.latitude)
      ) AS distance_meters,
      greatest(
        coalesce(c.geofence_radius_meters, 750),
        1
      ) + least(greatest(coalesce(p_accuracy_meters, 0), 0), 5000) AS effective_radius_meters,
      pc.attendance_state,
      pc.active_until,
      public.is_profile_convention_gameplay_eligible(cp.id, c.id) AS is_gameplay_eligible,
      (
        SELECT count(*)::integer
        FROM public.fursuits f
        JOIN public.fursuit_conventions fc
          ON fc.fursuit_id = f.id
         AND fc.convention_id = c.id
         AND fc.roster_state = 'active'
         AND fc.active_until IS NULL
        WHERE f.owner_id = cp.id
      ) AS rostered_owned_suit_count,
      os.owned_suit_count
    FROM current_profile cp
    CROSS JOIN owned_suits os
    JOIN public.conventions c
      ON c.latitude IS NOT NULL
     AND c.longitude IS NOT NULL
     AND public.is_convention_joinable(c.id)
    LEFT JOIN public.profile_conventions pc
      ON pc.profile_id = cp.id
     AND pc.convention_id = c.id
     AND pc.attendance_state = 'active'
     AND pc.active_until IS NULL
  ),
  candidates AS (
    SELECT
      raw_candidate.*,
      CASE
        WHEN raw_candidate.attendance_state IS NULL THEN 'join_convention'
        WHEN raw_candidate.is_gameplay_eligible IS NOT TRUE THEN 'finish_check_in'
        ELSE 'add_suit'
      END AS action,
      CASE
        WHEN raw_candidate.attendance_state IS NULL THEN 'not_joined'
        WHEN raw_candidate.is_gameplay_eligible IS TRUE THEN 'active'
        ELSE 'needs_location_verification'
      END AS membership_state
    FROM raw_candidates raw_candidate
  )
  SELECT
    candidate.convention_id,
    candidate.convention_name,
    candidate.distance_meters,
    candidate.action,
    candidate.membership_state,
    candidate.owned_suit_count,
    candidate.rostered_owned_suit_count
  FROM candidates candidate
  LEFT JOIN public.nearby_convention_setup_reminders reminder
    ON reminder.profile_id = auth.uid()
   AND reminder.convention_id = candidate.convention_id
   AND reminder.action = candidate.action
  WHERE reminder.id IS NULL
    AND candidate.distance_meters <= candidate.effective_radius_meters
    AND (
      candidate.attendance_state IS NULL
      OR candidate.is_gameplay_eligible IS NOT TRUE
      OR (
        candidate.owned_suit_count > 0
        AND candidate.rostered_owned_suit_count = 0
      )
    )
  ORDER BY candidate.distance_meters ASC, candidate.convention_name ASC, candidate.convention_id ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_nearby_convention_setup_reminder(
  double precision,
  double precision,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_nearby_convention_setup_reminder(
  double precision,
  double precision,
  integer
) TO authenticated;
