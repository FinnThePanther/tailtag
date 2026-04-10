-- Private Storage + Path-based media references
-- 1) Add path columns for media objects
-- 2) Make media buckets private
-- 3) Restrict storage read policies to authenticated users
-- 4) Remove anonymous read access to fursuits

alter table public.profiles
  add column if not exists avatar_path text;

alter table public.fursuits
  add column if not exists avatar_path text;

alter table public.catches
  add column if not exists catch_photo_path text;

update storage.buckets
set public = false
where id in ('catch-photos', 'fursuit-avatars', 'profile-avatars');

drop policy if exists "catch_photos_public_read" on storage.objects;
create policy "catch_photos_public_read"
on storage.objects
for select
to authenticated
using (bucket_id = 'catch-photos');

drop policy if exists "fursuit_public_read" on storage.objects;
create policy "fursuit_public_read"
on storage.objects
for select
to authenticated
using (bucket_id = 'fursuit-avatars');

drop policy if exists "Anyone can view profile avatars" on storage.objects;
create policy "Anyone can view profile avatars"
on storage.objects
for select
to authenticated
using (bucket_id = 'profile-avatars');

drop policy if exists "Anyone can view fursuits" on public.fursuits;
drop policy if exists "Authenticated users can view fursuits" on public.fursuits;
create policy "Authenticated users can view fursuits"
on public.fursuits
for select
to authenticated
using (true);
