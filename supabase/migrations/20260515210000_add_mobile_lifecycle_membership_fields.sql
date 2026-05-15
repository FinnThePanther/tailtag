-- Phase 2.1 mobile convention lifecycle data contract.
--
-- Expose player-safe lifecycle timestamps to the mobile membership reader so
-- finalizing and delayed recap UI can be built without exposing closeout errors.

DROP FUNCTION IF EXISTS public.get_my_convention_memberships();

CREATE FUNCTION public.get_my_convention_memberships()
RETURNS TABLE (
  convention_id uuid,
  id uuid,
  slug text,
  name text,
  location text,
  start_date date,
  end_date date,
  timezone text,
  latitude double precision,
  longitude double precision,
  geofence_radius_meters integer,
  geofence_enabled boolean,
  location_verification_required boolean,
  status text,
  finalizing_started_at timestamp with time zone,
  closeout_not_before timestamp with time zone,
  local_day date,
  is_joinable boolean,
  joined_at timestamp with time zone,
  verification_method text,
  verified_at timestamp with time zone,
  override_at timestamp with time zone,
  playable_notified_at timestamp with time zone,
  membership_state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    pc.convention_id,
    c.id,
    c.slug,
    c.name,
    c.location,
    c.start_date,
    c.end_date,
    COALESCE(NULLIF(c.timezone, ''), 'UTC') AS timezone,
    c.latitude,
    c.longitude,
    c.geofence_radius_meters,
    COALESCE(c.geofence_enabled, false) AS geofence_enabled,
    COALESCE(c.location_verification_required, false) AS location_verification_required,
    c.status,
    c.finalizing_started_at,
    c.closeout_not_before,
    info.local_day,
    public.is_convention_joinable(c.id) AS is_joinable,
    pc.created_at AS joined_at,
    pc.verification_method,
    pc.verified_at,
    pc.override_at,
    pc.playable_notified_at,
    CASE
      WHEN c.status IN ('closed', 'archived', 'canceled')
        OR (c.end_date IS NOT NULL AND info.local_day > c.end_date + 3)
        THEN 'past'
      WHEN c.start_date IS NOT NULL AND info.local_day < c.start_date
        THEN 'upcoming'
      WHEN c.status = 'scheduled'
        THEN 'awaiting_start'
      WHEN public.is_convention_joinable(c.id)
        AND COALESCE(c.location_verification_required, false)
        AND NOT public.is_profile_convention_gameplay_eligible(pc.profile_id, c.id)
        THEN 'needs_location_verification'
      WHEN public.is_profile_convention_gameplay_eligible(pc.profile_id, c.id)
        THEN 'active'
      WHEN public.is_convention_leaderboard_visible(c.id)
        THEN 'leaderboard_open'
      ELSE 'awaiting_start'
    END AS membership_state
  FROM public.profile_conventions pc
  JOIN public.conventions c ON c.id = pc.convention_id
  CROSS JOIN LATERAL (
    SELECT timezone(COALESCE(NULLIF(c.timezone, ''), 'UTC'), now())::date AS local_day
  ) info
  WHERE pc.profile_id = auth.uid()
    AND pc.attendance_state = 'active'
    AND pc.active_until IS NULL
  ORDER BY
    CASE
      WHEN public.is_profile_convention_gameplay_eligible(pc.profile_id, c.id) THEN 0
      WHEN public.is_convention_leaderboard_visible(c.id) THEN 1
      WHEN c.status IN ('closed', 'archived', 'canceled')
        OR (c.end_date IS NOT NULL AND info.local_day > c.end_date + 3) THEN 3
      ELSE 2
    END,
    c.start_date ASC NULLS LAST,
    pc.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_convention_memberships()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_convention_memberships() IS
  'Returns the current user convention memberships with player-safe lifecycle timestamps for mobile UI.';
