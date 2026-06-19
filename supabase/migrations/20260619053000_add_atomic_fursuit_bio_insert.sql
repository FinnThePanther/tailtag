CREATE OR REPLACE FUNCTION public.insert_next_fursuit_bio_version(
  p_fursuit_id uuid,
  p_owner_name text,
  p_photo_credit text,
  p_pronouns text,
  p_likes_and_interests text,
  p_ask_me_about text,
  p_social_links jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_next_version integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.fursuits f
    WHERE f.id = p_fursuit_id
      AND f.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Fursuit not found or not owned by current user'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(coalesce(p_social_links, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Fursuit bio social links must be a JSON array'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_fursuit_id::text, 0));

  SELECT coalesce(max(fb.version), 0) + 1
  INTO v_next_version
  FROM public.fursuit_bios fb
  WHERE fb.fursuit_id = p_fursuit_id;

  INSERT INTO public.fursuit_bios (
    fursuit_id,
    version,
    owner_name,
    photo_credit,
    pronouns,
    likes_and_interests,
    ask_me_about,
    social_links
  )
  VALUES (
    p_fursuit_id,
    v_next_version,
    coalesce(p_owner_name, ''),
    coalesce(p_photo_credit, ''),
    coalesce(p_pronouns, ''),
    coalesce(p_likes_and_interests, ''),
    coalesce(p_ask_me_about, ''),
    coalesce(p_social_links, '[]'::jsonb)
  );

  RETURN v_next_version;
END;
$function$;

REVOKE ALL ON FUNCTION public.insert_next_fursuit_bio_version(uuid, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_next_fursuit_bio_version(uuid, text, text, text, text, text, jsonb)
  TO authenticated, service_role;
