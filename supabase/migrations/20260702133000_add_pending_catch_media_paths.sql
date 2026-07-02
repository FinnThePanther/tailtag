DROP FUNCTION IF EXISTS public.get_pending_catches(uuid);

CREATE OR REPLACE FUNCTION public.get_pending_catches(p_user_id uuid)
RETURNS TABLE (
  catch_id uuid,
  catcher_id uuid,
  catcher_username text,
  catcher_avatar_url text,
  fursuit_id uuid,
  fursuit_name text,
  fursuit_avatar_url text,
  caught_at timestamp with time zone,
  expires_at timestamp with time zone,
  convention_id uuid,
  convention_name text,
  time_remaining interval,
  catch_photo_url text,
  catch_photo_source text,
  photo_upload_state text,
  reciprocal_offer_id uuid,
  reciprocal_fursuit_id uuid,
  reciprocal_fursuit_name text,
  reciprocal_fursuit_avatar_url text,
  catcher_avatar_path text,
  fursuit_avatar_path text,
  catch_photo_path text,
  reciprocal_fursuit_avatar_path text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    c.id AS catch_id,
    c.catcher_id,
    p.username AS catcher_username,
    p.avatar_url AS catcher_avatar_url,
    c.fursuit_id,
    f.name AS fursuit_name,
    f.avatar_url AS fursuit_avatar_url,
    c.caught_at,
    c.expires_at,
    c.convention_id,
    conv.name AS convention_name,
    (c.expires_at - now()) AS time_remaining,
    c.catch_photo_url,
    c.catch_photo_source,
    c.photo_upload_state,
    cro.id AS reciprocal_offer_id,
    cro.offered_fursuit_id AS reciprocal_fursuit_id,
    rf.name AS reciprocal_fursuit_name,
    rf.avatar_url AS reciprocal_fursuit_avatar_url,
    p.avatar_path AS catcher_avatar_path,
    f.avatar_path AS fursuit_avatar_path,
    c.catch_photo_path,
    rf.avatar_path AS reciprocal_fursuit_avatar_path
  FROM public.catches c
  JOIN public.fursuits f ON c.fursuit_id = f.id
  JOIN public.profiles p ON c.catcher_id = p.id
  LEFT JOIN public.conventions conv ON c.convention_id = conv.id
  LEFT JOIN public.catch_reciprocal_offers cro
    ON cro.primary_catch_id = c.id
   AND cro.status = 'PENDING'
  LEFT JOIN public.fursuits rf ON rf.id = cro.offered_fursuit_id
  WHERE f.owner_id = p_user_id
    AND c.status = 'PENDING'
    AND c.expires_at > now()
    AND (
      c.catch_photo_source IS NULL
      OR c.photo_upload_state = 'uploaded'
    )
  ORDER BY c.caught_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_pending_catches(uuid)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_blocked_users(uuid);

CREATE OR REPLACE FUNCTION public.get_blocked_users(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  blocker_id uuid,
  blocked_id uuid,
  blocked_username text,
  blocked_avatar_url text,
  created_at timestamp with time zone,
  blocked_avatar_path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    ub.id,
    ub.blocker_id,
    ub.blocked_id,
    p.username::text,
    p.avatar_url::text,
    ub.created_at,
    p.avatar_path::text
  FROM public.user_blocks ub
  JOIN public.profiles p ON p.id = ub.blocked_id
  WHERE ub.blocker_id = p_user_id
  ORDER BY ub.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_blocked_users(uuid)
  TO authenticated, service_role;
