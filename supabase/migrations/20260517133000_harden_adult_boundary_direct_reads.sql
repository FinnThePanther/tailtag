-- Harden adult-boundary enforcement for direct table and storage reads.

CREATE INDEX IF NOT EXISTS profiles_avatar_path_idx
  ON public.profiles (avatar_path)
  WHERE avatar_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS fursuits_avatar_path_idx
  ON public.fursuits (avatar_path)
  WHERE avatar_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS catches_catch_photo_path_idx
  ON public.catches (catch_photo_path)
  WHERE catch_photo_path IS NOT NULL;

DROP POLICY IF EXISTS "Admins can view all fursuits" ON public.fursuits;
DROP POLICY IF EXISTS "Anyone can view fursuits" ON public.fursuits;
DROP POLICY IF EXISTS "Authenticated users can view fursuits" ON public.fursuits;
DROP POLICY IF EXISTS "Users can view their own fursuits" ON public.fursuits;

CREATE POLICY "fursuits_select_adult_boundary"
ON public.fursuits
FOR SELECT
TO authenticated
USING (public.can_view_fursuit(auth.uid(), id));

DROP POLICY IF EXISTS "fursuit_bios_select_all_authenticated" ON public.fursuit_bios;

CREATE POLICY "fursuit_bios_select_adult_boundary"
ON public.fursuit_bios
FOR SELECT
TO authenticated
USING (public.can_view_fursuit(auth.uid(), fursuit_id));

DROP POLICY IF EXISTS "fursuit_color_assignments_select"
  ON public.fursuit_color_assignments;

CREATE POLICY "fursuit_color_assignments_select_adult_boundary"
ON public.fursuit_color_assignments
FOR SELECT
TO authenticated
USING (public.can_view_fursuit(auth.uid(), fursuit_id));

DROP POLICY IF EXISTS "fursuit_makers_select_all_authenticated" ON public.fursuit_makers;

CREATE POLICY "fursuit_makers_select_adult_boundary"
ON public.fursuit_makers
FOR SELECT
TO authenticated
USING (public.can_view_fursuit(auth.uid(), fursuit_id));

DROP POLICY IF EXISTS "fursuit_conventions_public_read" ON public.fursuit_conventions;

CREATE POLICY "fursuit_conventions_select_adult_boundary"
ON public.fursuit_conventions
FOR SELECT
TO authenticated
USING (public.can_view_fursuit(auth.uid(), fursuit_id));

DROP POLICY IF EXISTS "catch_photos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "adult_boundary_catch_photos_read" ON storage.objects;

CREATE POLICY "adult_boundary_catch_photos_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'catch-photos'
  AND EXISTS (
    SELECT 1
    FROM public.catches c
    WHERE (
        c.catch_photo_path = storage.objects.name
        OR position('/catch-photos/' || storage.objects.name IN coalesce(c.catch_photo_url, '')) > 0
      )
      AND public.can_view_fursuit(auth.uid(), c.fursuit_id)
  )
);

DROP POLICY IF EXISTS "fursuit_public_read" ON storage.objects;
DROP POLICY IF EXISTS "adult_boundary_fursuit_avatars_read" ON storage.objects;

CREATE POLICY "adult_boundary_fursuit_avatars_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'fursuit-avatars'
  AND EXISTS (
    SELECT 1
    FROM public.fursuits f
    WHERE (
        f.avatar_path = storage.objects.name
        OR position('/fursuit-avatars/' || storage.objects.name IN coalesce(f.avatar_url, '')) > 0
      )
      AND public.can_view_fursuit(auth.uid(), f.id)
  )
);

DROP POLICY IF EXISTS "Anyone can view profile avatars" ON storage.objects;
DROP POLICY IF EXISTS "adult_boundary_profile_avatars_read" ON storage.objects;

CREATE POLICY "adult_boundary_profile_avatars_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (
        p.avatar_path = storage.objects.name
        OR position('/profile-avatars/' || storage.objects.name IN coalesce(p.avatar_url, '')) > 0
      )
      AND public.can_view_profile(auth.uid(), p.id)
  )
);
