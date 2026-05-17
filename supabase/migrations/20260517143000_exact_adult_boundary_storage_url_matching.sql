-- Keep storage URL fallbacks exact so partial object names cannot authorize reads.

CREATE OR REPLACE FUNCTION public.can_view_profile_avatar_object(
  p_viewer_id uuid,
  p_object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (
        p.avatar_path = p_object_name
        OR coalesce(p.avatar_url, '') = '/profile-avatars/' || p_object_name
      )
      AND public.can_view_profile(p_viewer_id, p.id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_view_fursuit_avatar_object(
  p_viewer_id uuid,
  p_object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.fursuits f
    WHERE (
        f.avatar_path = p_object_name
        OR coalesce(f.avatar_url, '') = '/fursuit-avatars/' || p_object_name
      )
      AND public.can_view_fursuit(p_viewer_id, f.id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_view_catch_photo_object(
  p_viewer_id uuid,
  p_object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.catches c
    WHERE (
        c.catch_photo_path = p_object_name
        OR coalesce(c.catch_photo_url, '') = '/catch-photos/' || p_object_name
      )
      AND public.can_view_fursuit(p_viewer_id, c.fursuit_id)
  );
$function$;

