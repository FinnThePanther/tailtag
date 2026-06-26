BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS qr_token_hash text,
  ADD COLUMN IF NOT EXISTS replaced_by_tag_id uuid,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_scanned_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS catch_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.tags
  ADD CONSTRAINT tags_replaced_by_tag_id_fkey
  FOREIGN KEY (replaced_by_tag_id) REFERENCES public.tags(id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.tags
  VALIDATE CONSTRAINT tags_replaced_by_tag_id_fkey;

ALTER TABLE public.tags
  ADD CONSTRAINT tags_disabled_by_fkey
  FOREIGN KEY (disabled_by) REFERENCES public.profiles(id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.tags
  VALIDATE CONSTRAINT tags_disabled_by_fkey;

UPDATE public.tags
SET
  qr_token_hash = encode(extensions.digest(qr_token, 'sha256'), 'hex'),
  label = coalesce(nullif(btrim(label), ''), 'Badge QR')
WHERE qr_token IS NOT NULL
  AND qr_token_hash IS NULL;

UPDATE public.tags
SET label = coalesce(nullif(btrim(label), ''), 'Badge QR')
WHERE label IS NULL;

ALTER TABLE public.tags
  ALTER COLUMN qr_token DROP NOT NULL;

ALTER TABLE public.tags
  DROP CONSTRAINT IF EXISTS tags_identifier_present;

ALTER TABLE public.tags
  ADD CONSTRAINT tags_qr_identifier_present
  CHECK (qr_token IS NOT NULL OR qr_token_hash IS NOT NULL) NOT VALID;

ALTER TABLE public.tags
  VALIDATE CONSTRAINT tags_qr_identifier_present;

ALTER TABLE public.tags
  DROP CONSTRAINT IF EXISTS tags_status_check;

ALTER TABLE public.tags
  ADD CONSTRAINT tags_status_check
  CHECK (status = ANY (ARRAY[
    'registered'::text,
    'linked'::text,
    'active'::text,
    'unlinked'::text,
    'disabled'::text,
    'replaced'::text,
    'expired'::text
  ])) NOT VALID;

ALTER TABLE public.tags
  VALIDATE CONSTRAINT tags_status_check;

ALTER TABLE public.tag_scans
  DROP CONSTRAINT IF EXISTS tag_scans_result_check;

ALTER TABLE public.tag_scans
  ADD CONSTRAINT tag_scans_result_check
  CHECK (result = ANY (ARRAY[
    'success'::text,
    'cooldown'::text,
    'invalid'::text,
    'not_found'::text,
    'lost'::text,
    'revoked'::text,
    'disabled'::text,
    'replaced'::text,
    'expired'::text
  ])) NOT VALID;

ALTER TABLE public.tag_scans
  VALIDATE CONSTRAINT tag_scans_result_check;

DROP INDEX IF EXISTS public.idx_tags_one_active_per_fursuit;
DROP INDEX IF EXISTS public.idx_nfc_tags_one_active_per_fursuit;
DROP INDEX IF EXISTS public.tags_qr_token_hash_key;

CREATE UNIQUE INDEX tags_qr_token_hash_key
  ON public.tags (qr_token_hash)
  WHERE qr_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS tags_fursuit_status_idx
  ON public.tags (fursuit_id, status)
  WHERE fursuit_id IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('qr-assets', 'qr-assets', false, 1048576, ARRAY['image/png', 'image/svg+xml'])
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/png', 'image/svg+xml'];

CREATE OR REPLACE FUNCTION public.hash_qr_token(p_token text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT encode(extensions.digest(p_token, 'sha256'), 'hex');
$function$;

CREATE OR REPLACE FUNCTION public.generate_qr_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=');
$function$;

CREATE OR REPLACE FUNCTION public.normalize_qr_label(p_label text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT nullif(left(btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g')), 64), '');
$function$;

CREATE OR REPLACE FUNCTION public.is_active_qr_tag_status(
  p_status text,
  p_disabled_at timestamptz,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_status IN ('linked', 'active')
    AND p_disabled_at IS NULL
    AND (p_expires_at IS NULL OR p_expires_at > now());
$function$;

CREATE OR REPLACE FUNCTION public.user_owns_fursuit(
  p_profile_id uuid,
  p_fursuit_id uuid
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
    WHERE f.id = p_fursuit_id
      AND f.owner_id = p_profile_id
  );
$function$;

REVOKE ALL ON FUNCTION public.user_owns_fursuit(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_fursuit(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_qr_asset_object(
  p_viewer_id uuid,
  p_object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT split_part(coalesce(p_object_name, ''), '/', 1) = p_viewer_id::text
    OR EXISTS (
      SELECT 1
      FROM public.tags t
      JOIN public.fursuits f ON f.id = t.fursuit_id
      WHERE t.qr_asset_path = p_object_name
        AND f.owner_id = p_viewer_id
    );
$function$;

REVOKE ALL ON FUNCTION public.can_manage_qr_asset_object(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_qr_asset_object(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_public_qr_fursuit_avatar_object(p_object_name text)
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
      AND f.visibility_audience = 'public'
      AND f.owner_attribution_visibility = 'public'
  );
$function$;

REVOKE ALL ON FUNCTION public.can_view_public_qr_fursuit_avatar_object(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_public_qr_fursuit_avatar_object(text)
  TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "qr_public_fursuit_avatar_read" ON storage.objects;
CREATE POLICY "qr_public_fursuit_avatar_read"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'fursuit-avatars'
  AND public.can_view_public_qr_fursuit_avatar_object(storage.objects.name)
);

DROP POLICY IF EXISTS "qr_assets_owner_read" ON storage.objects;
CREATE POLICY "qr_assets_owner_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'qr-assets'
  AND public.can_manage_qr_asset_object(auth.uid(), storage.objects.name)
);

DROP POLICY IF EXISTS "qr_assets_owner_insert" ON storage.objects;
CREATE POLICY "qr_assets_owner_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'qr-assets'
  AND public.can_manage_qr_asset_object(auth.uid(), storage.objects.name)
);

DROP POLICY IF EXISTS "qr_assets_owner_update" ON storage.objects;
CREATE POLICY "qr_assets_owner_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'qr-assets'
  AND public.can_manage_qr_asset_object(auth.uid(), storage.objects.name)
)
WITH CHECK (
  bucket_id = 'qr-assets'
  AND public.can_manage_qr_asset_object(auth.uid(), storage.objects.name)
);

DROP POLICY IF EXISTS "qr_assets_owner_delete" ON storage.objects;
CREATE POLICY "qr_assets_owner_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'qr-assets'
  AND public.can_manage_qr_asset_object(auth.uid(), storage.objects.name)
);

CREATE OR REPLACE FUNCTION public.list_fursuit_qr_codes(p_fursuit_id uuid)
RETURNS TABLE (
  tag_id uuid,
  fursuit_id uuid,
  label text,
  status text,
  qr_asset_path text,
  created_at timestamptz,
  linked_at timestamptz,
  disabled_at timestamptz,
  expires_at timestamptz,
  replaced_by_tag_id uuid,
  last_scanned_at timestamptz,
  scan_count integer,
  catch_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_owns_fursuit(auth.uid(), p_fursuit_id) THEN
    RAISE EXCEPTION 'Fursuit not found';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.fursuit_id,
    t.label,
    CASE
      WHEN t.status IN ('linked', 'active') AND t.expires_at IS NOT NULL AND t.expires_at <= now()
        THEN 'expired'
      WHEN t.status = 'active' THEN 'linked'
      ELSE t.status
    END,
    t.qr_asset_path,
    t.registered_at,
    t.linked_at,
    t.disabled_at,
    t.expires_at,
    t.replaced_by_tag_id,
    t.last_scanned_at,
    t.scan_count,
    t.catch_count
  FROM public.tags t
  WHERE t.fursuit_id = p_fursuit_id
  ORDER BY t.registered_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_fursuit_qr_code(
  p_fursuit_id uuid,
  p_label text DEFAULT NULL
)
RETURNS TABLE (
  tag_id uuid,
  fursuit_id uuid,
  label text,
  status text,
  qr_token text,
  qr_url text,
  qr_asset_path text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_label text := coalesce(public.normalize_qr_label(p_label), 'Badge QR');
  v_active_count integer;
  v_token text;
  v_token_hash text;
  v_tag_id uuid;
  v_asset_path text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_owns_fursuit(auth.uid(), p_fursuit_id) THEN
    RAISE EXCEPTION 'Fursuit not found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_fursuit_id::text, 0));

  SELECT count(*)::integer
  INTO v_active_count
  FROM public.tags t
  WHERE t.fursuit_id = p_fursuit_id
    AND public.is_active_qr_tag_status(t.status, t.disabled_at, t.expires_at);

  IF v_active_count >= 10 THEN
    RAISE EXCEPTION 'A fursuit can have up to 10 active QR codes';
  END IF;

  LOOP
    v_token := public.generate_qr_token();
    v_token_hash := public.hash_qr_token(v_token);
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.tags t WHERE t.qr_token_hash = v_token_hash
    );
  END LOOP;

  INSERT INTO public.tags (
    fursuit_id,
    registered_by_user_id,
    status,
    label,
    qr_token_hash,
    qr_token_created_at,
    linked_at
  )
  VALUES (
    p_fursuit_id,
    auth.uid(),
    'linked',
    v_label,
    v_token_hash,
    now(),
    now()
  )
  RETURNING id INTO v_tag_id;

  v_asset_path := auth.uid()::text || '/' || v_tag_id::text || '.png';

  PERFORM public.attach_fursuit_qr_asset(v_tag_id, v_asset_path);

  RETURN QUERY
  SELECT
    t.id,
    t.fursuit_id,
    t.label,
    'linked'::text,
    v_token,
    'https://www.playtailtag.com/catch/qr/' || v_token,
    v_asset_path,
    t.registered_at
  FROM public.tags t
  WHERE t.id = v_tag_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.attach_fursuit_qr_asset(
  p_tag_id uuid,
  p_asset_path text
)
RETURNS TABLE (tag_id uuid, qr_asset_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tag record;
  v_asset_path text := nullif(btrim(p_asset_path), '');
BEGIN
  SELECT t.id, t.fursuit_id, f.owner_id
  INTO v_tag
  FROM public.tags t
  JOIN public.fursuits f ON f.id = t.fursuit_id
  WHERE t.id = p_tag_id;

  IF NOT found OR auth.uid() IS NULL OR v_tag.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'QR code not found';
  END IF;

  IF v_asset_path IS NULL OR v_asset_path !~ ('^' || auth.uid()::text || '/' || p_tag_id::text || '\.(png|svg)$') THEN
    RAISE EXCEPTION 'Invalid QR asset path';
  END IF;

  UPDATE public.tags
  SET qr_asset_path = v_asset_path,
      updated_at = now()
  WHERE id = p_tag_id;

  RETURN QUERY SELECT p_tag_id, v_asset_path;
END;
$function$;

CREATE OR REPLACE FUNCTION public.disable_fursuit_qr_code(p_tag_id uuid)
RETURNS TABLE (tag_id uuid, status text, disabled_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tag record;
BEGIN
  SELECT t.id, f.owner_id
  INTO v_tag
  FROM public.tags t
  JOIN public.fursuits f ON f.id = t.fursuit_id
  WHERE t.id = p_tag_id;

  IF NOT found OR auth.uid() IS NULL OR v_tag.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'QR code not found';
  END IF;

  UPDATE public.tags
  SET status = CASE WHEN status = 'replaced' THEN status ELSE 'disabled' END,
      disabled_at = coalesce(disabled_at, now()),
      disabled_by = coalesce(disabled_by, auth.uid()),
      updated_at = now()
  WHERE id = p_tag_id;

  RETURN QUERY
  SELECT t.id, t.status, t.disabled_at
  FROM public.tags t
  WHERE t.id = p_tag_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.replace_fursuit_qr_code(p_tag_id uuid)
RETURNS TABLE (
  old_tag_id uuid,
  tag_id uuid,
  fursuit_id uuid,
  label text,
  status text,
  qr_token text,
  qr_url text,
  qr_asset_path text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old record;
  v_new record;
BEGIN
  SELECT
    t.id,
    t.fursuit_id,
    t.label,
    t.status,
    t.replaced_by_tag_id,
    f.owner_id
  INTO v_old
  FROM public.tags t
  JOIN public.fursuits f ON f.id = t.fursuit_id
  WHERE t.id = p_tag_id
  FOR UPDATE OF t;

  IF NOT found OR auth.uid() IS NULL OR v_old.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'QR code not found';
  END IF;

  IF v_old.fursuit_id IS NULL THEN
    RAISE EXCEPTION 'QR code is not linked to a fursuit';
  END IF;

  IF v_old.status = 'replaced' OR v_old.replaced_by_tag_id IS NOT NULL THEN
    RAISE EXCEPTION 'QR code has already been replaced';
  END IF;

  UPDATE public.tags
  SET status = 'replaced',
      disabled_at = coalesce(disabled_at, now()),
      disabled_by = coalesce(disabled_by, auth.uid()),
      updated_at = now()
  WHERE id = p_tag_id;

  SELECT *
  INTO v_new
  FROM public.create_fursuit_qr_code(v_old.fursuit_id, coalesce(v_old.label, 'Replacement QR'));

  UPDATE public.tags
  SET replaced_by_tag_id = v_new.tag_id,
      updated_at = now()
  WHERE id = p_tag_id;

  RETURN QUERY
  SELECT
    p_tag_id,
    v_new.tag_id,
    v_new.fursuit_id,
    v_new.label,
    v_new.status,
    v_new.qr_token,
    v_new.qr_url,
    v_new.qr_asset_path,
    v_new.created_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_fursuit_qr_preview(p_qr_token text)
RETURNS TABLE (
  valid boolean,
  result text,
  fursuit_id uuid,
  fursuit_name text,
  fursuit_avatar_path text,
  fursuit_avatar_url text,
  species_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_token text := nullif(btrim(p_qr_token), '');
  v_tag record;
BEGIN
  IF v_token IS NULL OR length(v_token) > 256 THEN
    RETURN QUERY SELECT false, 'invalid'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT
    t.id,
    t.status,
    t.disabled_at,
    t.expires_at,
    f.id AS fursuit_id,
    f.name,
    f.avatar_path,
    f.avatar_url,
    fs.name AS species_name,
    f.visibility_audience,
    f.owner_attribution_visibility
  INTO v_tag
  FROM public.tags t
  JOIN public.fursuits f ON f.id = t.fursuit_id
  LEFT JOIN public.fursuit_species fs ON fs.id = f.species_id
  WHERE t.qr_token_hash = public.hash_qr_token(v_token)
  LIMIT 1;

  IF NOT found THEN
    RETURN QUERY SELECT false, 'invalid'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_tag.status = 'replaced' THEN
    RETURN QUERY SELECT false, 'replaced'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_tag.status = 'disabled' OR v_tag.disabled_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'disabled'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_tag.status = 'expired' OR (v_tag.expires_at IS NOT NULL AND v_tag.expires_at <= now()) THEN
    RETURN QUERY SELECT false, 'expired'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_tag.status NOT IN ('linked', 'active') THEN
    RETURN QUERY SELECT false, 'unlinked'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_tag.visibility_audience = 'public' AND v_tag.owner_attribution_visibility = 'public' THEN
    RETURN QUERY
    SELECT
      true,
      'valid'::text,
      v_tag.fursuit_id,
      v_tag.name,
      v_tag.avatar_path,
      v_tag.avatar_url,
      v_tag.species_name;
  ELSE
    RETURN QUERY SELECT true, 'valid'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_qr_tag_counters(
  p_tag_id uuid,
  p_count_catch boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.tags
  SET
    last_scanned_at = now(),
    scan_count = scan_count + 1,
    catch_count = catch_count + CASE WHEN p_count_catch THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id = p_tag_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_fursuit_qr_codes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_fursuit_qr_code(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_fursuit_qr_asset(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disable_fursuit_qr_code(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_fursuit_qr_code(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_fursuit_qr_preview(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_qr_tag_counters(uuid, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_fursuit_qr_codes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_fursuit_qr_code(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attach_fursuit_qr_asset(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disable_fursuit_qr_code(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_fursuit_qr_code(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_fursuit_qr_preview(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_qr_tag_counters(uuid, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
