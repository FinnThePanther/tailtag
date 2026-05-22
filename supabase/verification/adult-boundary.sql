-- Adult interaction boundary verification.
--
-- Run against the dev project after applying the adult-boundary migrations:
--   supabase db query --linked -f supabase/verification/adult-boundary.sql
--
-- The script creates temporary scenario data inside a transaction and rolls it back.

BEGIN;

DO $$
DECLARE
  v_unknown uuid := '11111111-1111-4111-8111-111111111101';
  v_minor uuid := '11111111-1111-4111-8111-111111111102';
  v_adult uuid := '11111111-1111-4111-8111-111111111103';
  v_owner uuid := '11111111-1111-4111-8111-111111111104';
  v_moderator uuid := '11111111-1111-4111-8111-111111111105';
  v_profile_restricted_owner uuid := '11111111-1111-4111-8111-111111111106';
  v_public_owner uuid := '11111111-1111-4111-8111-111111111107';
  v_profile_restricted_suit uuid := '11111111-1111-4111-8111-111111111108';
  v_suit_restricted_suit uuid := '11111111-1111-4111-8111-111111111109';
  v_public_suit uuid := '11111111-1111-4111-8111-111111111110';
  v_convention uuid := '11111111-1111-4111-8111-111111111111';
  v_restricted_color uuid := '11111111-1111-4111-8111-111111111112';
  v_public_color uuid := '11111111-1111-4111-8111-111111111113';
BEGIN
  INSERT INTO auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data
  )
  VALUES
    (
      v_unknown,
      'authenticated',
      'authenticated',
      'abunknown@example.test',
      '',
      now(),
      now(),
      now(),
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      v_minor,
      'authenticated',
      'authenticated',
      'abminor@example.test',
      '',
      now(),
      now(),
      now(),
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      v_adult,
      'authenticated',
      'authenticated',
      'abadult@example.test',
      '',
      now(),
      now(),
      now(),
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      v_owner,
      'authenticated',
      'authenticated',
      'abowner@example.test',
      '',
      now(),
      now(),
      now(),
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      v_moderator,
      'authenticated',
      'authenticated',
      'abmod@example.test',
      '',
      now(),
      now(),
      now(),
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      v_profile_restricted_owner,
      'authenticated',
      'authenticated',
      'abprowner@example.test',
      '',
      now(),
      now(),
      now(),
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      v_public_owner,
      'authenticated',
      'authenticated',
      'abpubowner@example.test',
      '',
      now(),
      now(),
      now(),
      '{}'::jsonb,
      '{}'::jsonb
    );

  INSERT INTO public.profiles (
    id,
    username,
    role,
    avatar_path,
    avatar_url,
    is_adult,
    age_gate_version,
    visibility_audience,
    onboarding_completed,
    is_new
  )
  VALUES
    (v_unknown, 'abunknown', 'player', NULL, NULL, NULL, 1, 'everyone', true, false),
    (v_minor, 'abminor', 'player', NULL, NULL, false, 1, 'everyone', true, false),
    (v_adult, 'abadult', 'player', NULL, NULL, true, 1, 'everyone', true, false),
    (v_owner, 'abowner', 'owner', NULL, NULL, true, 1, 'everyone', true, false),
    (v_moderator, 'abmod', 'moderator', NULL, NULL, false, 1, 'everyone', true, false),
    (
      v_profile_restricted_owner,
      'abprowner',
      'player',
      NULL,
      'https://example.supabase.co/storage/v1/object/authenticated/profile-avatars/adult-boundary/restricted-profile.jpg',
      true,
      1,
      'adults_only',
      true,
      false
    ),
    (
      v_public_owner,
      'abpubowner',
      'player',
      'adult-boundary/public-profile.jpg',
      'https://example.supabase.co/storage/v1/object/authenticated/profile-avatars/adult-boundary/public-profile.jpg',
      true,
      1,
      'everyone',
      true,
      false
    )
  ON CONFLICT (id) DO UPDATE
  SET
    username = EXCLUDED.username,
    role = EXCLUDED.role,
    avatar_path = EXCLUDED.avatar_path,
    avatar_url = EXCLUDED.avatar_url,
    is_adult = EXCLUDED.is_adult,
    age_gate_version = EXCLUDED.age_gate_version,
    visibility_audience = EXCLUDED.visibility_audience,
    onboarding_completed = EXCLUDED.onboarding_completed,
    is_new = EXCLUDED.is_new;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    UPDATE public.profiles
    SET visibility_audience = 'adults_only'
    WHERE id = v_unknown;

    RAISE EXCEPTION 'unknown-age profile visibility update did not fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    UPDATE public.profiles
    SET visibility_audience = 'adults_only'
    WHERE id = v_minor;

    RAISE EXCEPTION 'under-18 profile visibility update did not fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' THEN
      RAISE;
    END IF;
  END;

  UPDATE public.profiles
  SET visibility_audience = 'adults_only'
  WHERE id = v_adult;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_adult
      AND visibility_audience = 'adults_only'
  ) THEN
    RAISE EXCEPTION 'adult profile visibility update did not persist';
  END IF;

  UPDATE public.profiles
  SET is_adult = false
  WHERE id = v_adult;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_adult
      AND visibility_audience = 'everyone'
  ) THEN
    RAISE EXCEPTION 'adult profile visibility was not cleared after age downgrade';
  END IF;

  UPDATE public.profiles
  SET
    is_adult = true,
    visibility_audience = 'everyone'
  WHERE id = v_adult;

  PERFORM set_config('request.jwt.claim.sub', v_profile_restricted_owner::text, true);
  INSERT INTO public.fursuits (
    id,
    owner_id,
    name,
    unique_code,
    avatar_path,
    avatar_url,
    visibility_audience,
    is_tutorial,
    is_flagged
  )
  VALUES (
    v_profile_restricted_suit,
    v_profile_restricted_owner,
    'Profile Restricted Suit',
    'ABP1',
    'adult-boundary/profile-restricted-suit.jpg',
    'https://example.supabase.co/storage/v1/object/authenticated/fursuit-avatars/adult-boundary/profile-restricted-suit.jpg',
    'everyone',
    false,
    false
  );

  PERFORM set_config('request.jwt.claim.sub', v_public_owner::text, true);
  INSERT INTO public.fursuits (
    id,
    owner_id,
    name,
    unique_code,
    avatar_path,
    avatar_url,
    visibility_audience,
    is_tutorial,
    is_flagged
  )
  VALUES
    (
      v_suit_restricted_suit,
      v_public_owner,
      'Suit Restricted Suit',
      'ABS1',
      NULL,
      'https://example.supabase.co/storage/v1/object/authenticated/fursuit-avatars/adult-boundary/suit-restricted-suit.jpg',
      'adults_only',
      false,
      false
    ),
    (
      v_public_suit,
      v_public_owner,
      'Public Suit',
      'ABU1',
      'adult-boundary/public-suit.jpg',
      'https://example.supabase.co/storage/v1/object/authenticated/fursuit-avatars/adult-boundary/public-suit.jpg',
      'everyone',
      false,
      false
    );

  INSERT INTO public.fursuit_colors (id, name)
  VALUES
    (v_restricted_color, 'Adult Boundary Restricted Color'),
    (v_public_color, 'Adult Boundary Public Color')
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name;

  INSERT INTO public.fursuit_color_assignments (fursuit_id, color_id, position)
  VALUES
    (v_profile_restricted_suit, v_restricted_color, 1),
    (v_suit_restricted_suit, v_restricted_color, 1),
    (v_public_suit, v_public_color, 1)
  ON CONFLICT (fursuit_id, color_id) DO NOTHING;

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
  VALUES
    (
      v_profile_restricted_suit,
      1,
      'Restricted Owner',
      '',
      'they/them',
      'Restricted likes',
      'Restricted ask',
      '[]'::jsonb
    ),
    (
      v_suit_restricted_suit,
      1,
      'Suit Restricted Owner',
      '',
      'they/them',
      'Suit restricted likes',
      'Suit restricted ask',
      '[]'::jsonb
    ),
    (v_public_suit, 1, 'Public Owner', '', 'they/them', 'Public likes', 'Public ask', '[]'::jsonb)
  ON CONFLICT (fursuit_id, version) DO UPDATE
  SET
    owner_name = EXCLUDED.owner_name,
    photo_credit = EXCLUDED.photo_credit,
    pronouns = EXCLUDED.pronouns,
    likes_and_interests = EXCLUDED.likes_and_interests,
    ask_me_about = EXCLUDED.ask_me_about,
    social_links = EXCLUDED.social_links;

  INSERT INTO public.fursuit_makers (
    fursuit_id,
    maker_name,
    normalized_maker_name,
    position
  )
  VALUES
    (v_profile_restricted_suit, 'Restricted Maker', 'restricted maker', 1),
    (v_suit_restricted_suit, 'Suit Restricted Maker', 'suit restricted maker', 1),
    (v_public_suit, 'Public Maker', 'public maker', 1)
  ON CONFLICT (fursuit_id, position) DO NOTHING;

  INSERT INTO public.conventions (id, slug, name, status, timezone)
  VALUES (v_convention, 'adult-boundary-verification', 'Adult Boundary Verification', 'live', 'UTC');

  INSERT INTO public.profile_conventions (profile_id, convention_id, attendance_state)
  VALUES
    (v_unknown, v_convention, 'active'),
    (v_minor, v_convention, 'active'),
    (v_adult, v_convention, 'active'),
    (v_profile_restricted_owner, v_convention, 'active'),
    (v_public_owner, v_convention, 'active');

  INSERT INTO public.fursuit_conventions (fursuit_id, convention_id, roster_visible)
  VALUES
    (v_profile_restricted_suit, v_convention, true),
    (v_suit_restricted_suit, v_convention, true),
    (v_public_suit, v_convention, true);

  INSERT INTO public.catches (
    catcher_id,
    fursuit_id,
    convention_id,
    status,
    catch_number,
    caught_at,
    catch_photo_path,
    catch_photo_url,
    is_tutorial
  )
  VALUES
    (
      v_minor,
      v_profile_restricted_suit,
      v_convention,
      'ACCEPTED',
      1,
      now(),
      NULL,
      'https://example.supabase.co/storage/v1/object/authenticated/catch-photos/adult-boundary/restricted-catch.jpg',
      false
    ),
    (v_adult, v_profile_restricted_suit, v_convention, 'ACCEPTED', 2, now(), NULL, NULL, false),
    (
      v_minor,
      v_public_suit,
      v_convention,
      'ACCEPTED',
      3,
      now(),
      'adult-boundary/public-catch.jpg',
      'https://example.supabase.co/storage/v1/object/authenticated/catch-photos/adult-boundary/public-catch.jpg',
      false
    );

  INSERT INTO storage.buckets (id, name, public)
  VALUES
    ('profile-avatars', 'profile-avatars', false),
    ('fursuit-avatars', 'fursuit-avatars', false),
    ('catch-photos', 'catch-photos', false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES
    ('profile-avatars', 'adult-boundary/restricted-profile.jpg', v_profile_restricted_owner, '{}'::jsonb),
    ('profile-avatars', 'adult-boundary/public-profile.jpg', v_public_owner, '{}'::jsonb),
    ('fursuit-avatars', 'adult-boundary/profile-restricted-suit.jpg', v_profile_restricted_owner, '{}'::jsonb),
    ('fursuit-avatars', 'adult-boundary/suit-restricted-suit.jpg', v_public_owner, '{}'::jsonb),
    ('fursuit-avatars', 'adult-boundary/public-suit.jpg', v_public_owner, '{}'::jsonb),
    ('catch-photos', 'adult-boundary/restricted-catch.jpg', v_minor, '{}'::jsonb),
    ('catch-photos', 'adult-boundary/public-catch.jpg', v_minor, '{}'::jsonb);

  PERFORM set_config('request.jwt.claim.sub', v_unknown::text, true);
  IF public.can_view_profile(v_unknown, v_profile_restricted_owner) THEN
    RAISE EXCEPTION 'unknown-age viewer can view adults-only profile';
  END IF;
  IF public.can_view_fursuit(v_unknown, v_profile_restricted_suit) THEN
    RAISE EXCEPTION 'unknown-age viewer can view profile-restricted fursuit';
  END IF;
  IF public.can_catch_fursuit(v_unknown, v_suit_restricted_suit) THEN
    RAISE EXCEPTION 'unknown-age viewer can catch adults-only fursuit';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_minor::text, true);
  IF public.can_view_profile(v_minor, v_profile_restricted_owner) THEN
    RAISE EXCEPTION 'under-18 viewer can view adults-only profile';
  END IF;
  IF public.can_view_fursuit(v_minor, v_suit_restricted_suit) THEN
    RAISE EXCEPTION 'under-18 viewer can view adults-only fursuit';
  END IF;
  IF public.can_catch_fursuit(v_minor, v_profile_restricted_suit) THEN
    RAISE EXCEPTION 'under-18 viewer can catch profile-restricted fursuit';
  END IF;
  IF NOT public.can_view_fursuit(v_minor, v_public_suit) THEN
    RAISE EXCEPTION 'under-18 viewer cannot view public fursuit';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.get_convention_suit_roster(v_convention)
    WHERE fursuit_id IN (v_profile_restricted_suit, v_suit_restricted_suit)
  ) THEN
    RAISE EXCEPTION 'restricted fursuit leaked into under-18 roster';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.get_convention_suit_leaderboard(v_convention)
    WHERE fursuit_id = v_profile_restricted_suit
  ) THEN
    RAISE EXCEPTION 'restricted fursuit leaked into under-18 suit leaderboard';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.get_convention_leaderboard(v_convention)
    WHERE catcher_id = v_adult
  ) THEN
    RAISE EXCEPTION 'restricted catch leaked into under-18 player leaderboard';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_my_caught_suits()
    WHERE fursuit_id = v_profile_restricted_suit
      AND fursuit_redacted = true
      AND fursuit_name = 'Unavailable fursuit'
      AND fursuit_owner_id IS NULL
  ) THEN
    RAISE EXCEPTION 'historical catch metadata was not redacted for under-18 catcher';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_adult::text, true);
  IF NOT public.can_view_profile(v_adult, v_profile_restricted_owner) THEN
    RAISE EXCEPTION 'adult viewer cannot view adults-only profile';
  END IF;
  IF NOT public.can_view_fursuit(v_adult, v_suit_restricted_suit) THEN
    RAISE EXCEPTION 'adult viewer cannot view adults-only fursuit';
  END IF;
  IF NOT public.can_catch_fursuit(v_adult, v_profile_restricted_suit) THEN
    RAISE EXCEPTION 'adult viewer cannot catch profile-restricted fursuit';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_convention_suit_roster(v_convention)
    WHERE fursuit_id IN (v_profile_restricted_suit, v_suit_restricted_suit)
  ) THEN
    RAISE EXCEPTION 'restricted fursuits missing from adult roster';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_profile_restricted_owner::text, true);
  IF NOT public.can_view_profile(v_profile_restricted_owner, v_profile_restricted_owner) THEN
    RAISE EXCEPTION 'owner cannot view own adults-only profile';
  END IF;
  IF NOT public.can_view_fursuit(v_profile_restricted_owner, v_profile_restricted_suit) THEN
    RAISE EXCEPTION 'owner cannot view own profile-restricted fursuit';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_moderator::text, true);
  IF NOT public.can_view_profile(v_moderator, v_profile_restricted_owner) THEN
    RAISE EXCEPTION 'moderator cannot view adults-only profile';
  END IF;
  IF NOT public.can_view_fursuit(v_moderator, v_suit_restricted_suit) THEN
    RAISE EXCEPTION 'moderator cannot view adults-only fursuit';
  END IF;
END $$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_unknown uuid := '11111111-1111-4111-8111-111111111101';
  v_minor uuid := '11111111-1111-4111-8111-111111111102';
  v_adult uuid := '11111111-1111-4111-8111-111111111103';
  v_owner uuid := '11111111-1111-4111-8111-111111111104';
  v_moderator uuid := '11111111-1111-4111-8111-111111111105';
  v_profile_restricted_owner uuid := '11111111-1111-4111-8111-111111111106';
  v_profile_restricted_suit uuid := '11111111-1111-4111-8111-111111111108';
  v_suit_restricted_suit uuid := '11111111-1111-4111-8111-111111111109';
  v_public_suit uuid := '11111111-1111-4111-8111-111111111110';
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  PERFORM set_config('request.jwt.claim.sub', v_unknown::text, true);
  IF EXISTS (
    SELECT 1
    FROM public.fursuits
    WHERE id IN (v_profile_restricted_suit, v_suit_restricted_suit)
  ) THEN
    RAISE EXCEPTION 'unknown-age direct fursuit select leaked restricted row';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id IN ('profile-avatars', 'fursuit-avatars', 'catch-photos')
      AND name IN (
        'adult-boundary/restricted-profile.jpg',
        'adult-boundary/profile-restricted-suit.jpg',
        'adult-boundary/suit-restricted-suit.jpg',
        'adult-boundary/restricted-catch.jpg'
      )
  ) THEN
    RAISE EXCEPTION 'unknown-age direct storage select leaked restricted object';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_minor::text, true);
  IF EXISTS (
    SELECT 1
    FROM public.fursuits
    WHERE id IN (v_profile_restricted_suit, v_suit_restricted_suit)
  ) THEN
    RAISE EXCEPTION 'under-18 direct fursuit select leaked restricted row';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.fursuit_bios
    WHERE fursuit_id IN (v_profile_restricted_suit, v_suit_restricted_suit)
  ) THEN
    RAISE EXCEPTION 'under-18 direct fursuit bio select leaked restricted row';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.fursuit_color_assignments
    WHERE fursuit_id IN (v_profile_restricted_suit, v_suit_restricted_suit)
  ) THEN
    RAISE EXCEPTION 'under-18 direct fursuit color select leaked restricted row';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.fursuit_makers
    WHERE fursuit_id IN (v_profile_restricted_suit, v_suit_restricted_suit)
  ) THEN
    RAISE EXCEPTION 'under-18 direct fursuit maker select leaked restricted row';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.fursuit_conventions
    WHERE fursuit_id IN (v_profile_restricted_suit, v_suit_restricted_suit)
  ) THEN
    RAISE EXCEPTION 'under-18 direct fursuit convention select leaked restricted row';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.fursuits
    WHERE id = v_public_suit
  ) THEN
    RAISE EXCEPTION 'under-18 direct fursuit select hid public row';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'fursuit-avatars'
      AND name = 'adult-boundary/public-suit.jpg'
  ) THEN
    RAISE EXCEPTION 'under-18 direct storage select hid public fursuit avatar';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'profile-avatars'
      AND name = 'adult-boundary/public-profile.jpg'
  ) THEN
    RAISE EXCEPTION 'under-18 direct storage select hid public profile avatar';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'catch-photos'
      AND name = 'adult-boundary/public-catch.jpg'
  ) THEN
    RAISE EXCEPTION 'under-18 direct storage select hid public catch photo';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id IN ('profile-avatars', 'fursuit-avatars', 'catch-photos')
      AND name IN (
        'adult-boundary/restricted-profile.jpg',
        'adult-boundary/profile-restricted-suit.jpg',
        'adult-boundary/suit-restricted-suit.jpg',
        'adult-boundary/restricted-catch.jpg'
      )
  ) THEN
    RAISE EXCEPTION 'under-18 direct storage select leaked restricted object';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_adult::text, true);
  IF NOT EXISTS (
    SELECT 1
    FROM public.fursuits
    WHERE id IN (v_profile_restricted_suit, v_suit_restricted_suit)
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'adult direct fursuit select cannot see restricted rows';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.fursuit_bios
    WHERE fursuit_id IN (v_profile_restricted_suit, v_suit_restricted_suit)
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'adult direct fursuit bio select cannot see restricted rows';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.fursuit_color_assignments
    WHERE fursuit_id IN (v_profile_restricted_suit, v_suit_restricted_suit)
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'adult direct fursuit_color_assignments select cannot see restricted rows';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.fursuit_makers
    WHERE fursuit_id IN (v_profile_restricted_suit, v_suit_restricted_suit)
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'adult direct fursuit_makers select cannot see restricted rows';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.fursuit_conventions
    WHERE fursuit_id IN (v_profile_restricted_suit, v_suit_restricted_suit)
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'adult direct fursuit_conventions select cannot see restricted rows';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id IN ('profile-avatars', 'fursuit-avatars', 'catch-photos')
      AND name IN (
        'adult-boundary/restricted-profile.jpg',
        'adult-boundary/profile-restricted-suit.jpg',
        'adult-boundary/suit-restricted-suit.jpg',
        'adult-boundary/restricted-catch.jpg'
      )
    HAVING count(*) = 4
  ) THEN
    RAISE EXCEPTION 'adult direct storage select cannot see restricted objects';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_profile_restricted_owner::text, true);
  IF NOT EXISTS (
    SELECT 1
    FROM public.fursuits
    WHERE id = v_profile_restricted_suit
  ) THEN
    RAISE EXCEPTION 'content owner direct fursuit select cannot see own restricted row';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'fursuit-avatars'
      AND name = 'adult-boundary/profile-restricted-suit.jpg'
  ) THEN
    RAISE EXCEPTION 'content owner direct storage select cannot see own restricted fursuit avatar';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  IF NOT EXISTS (
    SELECT 1
    FROM public.fursuits
    WHERE id IN (v_profile_restricted_suit, v_suit_restricted_suit)
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'owner role direct fursuit select cannot see restricted rows';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_moderator::text, true);
  IF NOT EXISTS (
    SELECT 1
    FROM public.fursuits
    WHERE id IN (v_profile_restricted_suit, v_suit_restricted_suit)
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'moderator direct fursuit select cannot see restricted rows';
  END IF;
END $$;

RESET ROLE;

ROLLBACK;

SELECT 'adult-boundary verification passed' AS result;
