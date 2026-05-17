-- Use SECURITY DEFINER helpers for adult-boundary storage policies so object
-- access is not accidentally constrained by unrelated base-table RLS.

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
        OR right(coalesce(p.avatar_url, ''), length('/profile-avatars/' || p_object_name)) =
          '/profile-avatars/' || p_object_name
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
        OR right(coalesce(f.avatar_url, ''), length('/fursuit-avatars/' || p_object_name)) =
          '/fursuit-avatars/' || p_object_name
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
        OR right(coalesce(c.catch_photo_url, ''), length('/catch-photos/' || p_object_name)) =
          '/catch-photos/' || p_object_name
      )
      AND public.can_view_fursuit(p_viewer_id, c.fursuit_id)
  );
$function$;

REVOKE ALL ON FUNCTION public.can_view_profile_avatar_object(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_fursuit_avatar_object(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_catch_photo_object(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.can_view_profile_avatar_object(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_fursuit_avatar_object(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_catch_photo_object(uuid, text)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "adult_boundary_catch_photos_read" ON storage.objects;

CREATE POLICY "adult_boundary_catch_photos_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'catch-photos'
  AND public.can_view_catch_photo_object(auth.uid(), storage.objects.name)
);

DROP POLICY IF EXISTS "adult_boundary_fursuit_avatars_read" ON storage.objects;

CREATE POLICY "adult_boundary_fursuit_avatars_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'fursuit-avatars'
  AND public.can_view_fursuit_avatar_object(auth.uid(), storage.objects.name)
);

DROP POLICY IF EXISTS "adult_boundary_profile_avatars_read" ON storage.objects;

CREATE POLICY "adult_boundary_profile_avatars_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND public.can_view_profile_avatar_object(auth.uid(), storage.objects.name)
);
