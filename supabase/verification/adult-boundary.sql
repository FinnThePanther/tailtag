-- Adult interaction boundary verification.
--
-- Run against the dev project after applying the adult-boundary migrations:
--   supabase db query --linked -f supabase/verification/adult-boundary.sql
--
-- The script creates temporary scenario data inside a transaction and rolls it back.

BEGIN;

DO $$
DECLARE
  v_unknown uuid := gen_random_uuid();
  v_minor uuid := gen_random_uuid();
  v_adult uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_moderator uuid := gen_random_uuid();
  v_profile_restricted_owner uuid := gen_random_uuid();
  v_public_owner uuid := gen_random_uuid();
  v_profile_restricted_suit uuid := gen_random_uuid();
  v_suit_restricted_suit uuid := gen_random_uuid();
  v_public_suit uuid := gen_random_uuid();
  v_convention uuid := gen_random_uuid();
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
    is_adult,
    age_gate_version,
    visibility_audience,
    onboarding_completed,
    is_new
  )
  VALUES
    (v_unknown, 'abunknown', 'player', NULL, 1, 'everyone', true, false),
    (v_minor, 'abminor', 'player', false, 1, 'everyone', true, false),
    (v_adult, 'abadult', 'player', true, 1, 'everyone', true, false),
    (v_owner, 'abowner', 'owner', true, 1, 'everyone', true, false),
    (v_moderator, 'abmod', 'moderator', false, 1, 'everyone', true, false),
    (
      v_profile_restricted_owner,
      'abprowner',
      'player',
      true,
      1,
      'adults_only',
      true,
      false
    ),
    (v_public_owner, 'abpubowner', 'player', true, 1, 'everyone', true, false)
  ON CONFLICT (id) DO UPDATE
  SET
    username = EXCLUDED.username,
    role = EXCLUDED.role,
    is_adult = EXCLUDED.is_adult,
    age_gate_version = EXCLUDED.age_gate_version,
    visibility_audience = EXCLUDED.visibility_audience,
    onboarding_completed = EXCLUDED.onboarding_completed,
    is_new = EXCLUDED.is_new;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  PERFORM set_config('request.jwt.claim.sub', v_profile_restricted_owner::text, true);
  INSERT INTO public.fursuits (
    id,
    owner_id,
    name,
    unique_code,
    visibility_audience,
    is_tutorial,
    is_flagged
  )
  VALUES (
    v_profile_restricted_suit,
    v_profile_restricted_owner,
    'Profile Restricted Suit',
    'ABP1',
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
      'adults_only',
      false,
      false
    ),
    (v_public_suit, v_public_owner, 'Public Suit', 'ABU1', 'everyone', false, false);

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
    is_tutorial
  )
  VALUES
    (v_minor, v_profile_restricted_suit, v_convention, 'ACCEPTED', 1, now(), false),
    (v_adult, v_profile_restricted_suit, v_convention, 'ACCEPTED', 2, now(), false),
    (v_minor, v_public_suit, v_convention, 'ACCEPTED', 3, now(), false);

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

ROLLBACK;

SELECT 'adult-boundary verification passed' AS result;
