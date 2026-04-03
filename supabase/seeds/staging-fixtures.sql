-- =============================================================================
-- TailTag Staging Fixtures
-- =============================================================================
-- Test data for dev and staging environments ONLY. Never run in production.
--
-- Prerequisites:
--   - Baseline migration has been applied
--   - reference.sql has been run
--
-- Creates:
--   - 2 test conventions
--   - 4 test user accounts (player, fursuit owner, staff, admin)
--   - 3 test fursuits with species/color assignments
--   - Tags linked to fursuits
--   - Convention registrations
--
-- All test accounts use password: TestPassword123!
-- =============================================================================

BEGIN;

-- =============================================================================
-- Fixed UUIDs for deterministic references
-- =============================================================================

-- Conventions
-- con1: 'aaaaaaaa-0000-4000-8000-000000000001'  (TestCon - Seattle)
-- con2: 'aaaaaaaa-0000-4000-8000-000000000002'  (FurFest East - Orlando)

-- Users
-- player:        'bbbbbbbb-0000-4000-8000-000000000001'
-- fursuit_owner:  'bbbbbbbb-0000-4000-8000-000000000002'
-- staff:          'bbbbbbbb-0000-4000-8000-000000000003'
-- admin:          'bbbbbbbb-0000-4000-8000-000000000004'

-- Fursuits
-- suit1: 'cccccccc-0000-4000-8000-000000000001'  (Blaze - Fox)
-- suit2: 'cccccccc-0000-4000-8000-000000000002'  (Midnight - Wolf)
-- suit3: 'cccccccc-0000-4000-8000-000000000003'  (Patches - Hybrid)

-- Tags
-- tag1: 'dddddddd-0000-4000-8000-000000000001'  (linked to Blaze)
-- tag2: 'dddddddd-0000-4000-8000-000000000002'  (linked to Midnight)


-- =============================================================================
-- 1. Test Conventions
-- =============================================================================
INSERT INTO conventions (id, slug, name, location, start_date, end_date, timezone, config, latitude, longitude, geofence_radius_meters, geofence_enabled, location_verification_required) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'testcon',       'TestCon',        'Seattle, WA',  '2026-01-01', '2026-12-31', 'America/Los_Angeles',  '{}', 47.617070, -122.337515, 500, false, false),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'furfest-east',  'FurFest East',   'Orlando, FL',  '2026-06-15', '2026-06-18', 'America/New_York',     '{}', 28.538336, -81.379234,  500, false, false)
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- 2. Test User Accounts
-- =============================================================================
-- Insert auth users and profiles directly (auth triggers may not exist on fresh projects)

INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) VALUES
  (
    'bbbbbbbb-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'player@test.tailtag.app',
    crypt('TestPassword123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    'bbbbbbbb-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'fursuit-owner@test.tailtag.app',
    crypt('TestPassword123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    'bbbbbbbb-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'staff@test.tailtag.app',
    crypt('TestPassword123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    'bbbbbbbb-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'admin@test.tailtag.app',
    crypt('TestPassword123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  )
ON CONFLICT (id) DO NOTHING;

-- Insert identities (required for email login to work)
INSERT INTO auth.identities (
  id, user_id, provider_id, provider,
  identity_data, last_sign_in_at, created_at, updated_at
) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'email',
   jsonb_build_object('sub', 'bbbbbbbb-0000-4000-8000-000000000001', 'email', 'player@test.tailtag.app'),
   now(), now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'email',
   jsonb_build_object('sub', 'bbbbbbbb-0000-4000-8000-000000000002', 'email', 'fursuit-owner@test.tailtag.app'),
   now(), now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000003', 'email',
   jsonb_build_object('sub', 'bbbbbbbb-0000-4000-8000-000000000003', 'email', 'staff@test.tailtag.app'),
   now(), now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000004', 'email',
   jsonb_build_object('sub', 'bbbbbbbb-0000-4000-8000-000000000004', 'email', 'admin@test.tailtag.app'),
   now(), now(), now())
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- 3. Profiles (inserted directly — auth trigger may not exist on fresh projects)
-- =============================================================================
INSERT INTO profiles (id, username, role, onboarding_completed, is_new) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'TestPlayer', 'player', true, false),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'TestSuiter', 'player', true, false),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'TestStaff',  'staff',  true, false),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'TestAdmin',  'owner',  true, false)
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- 4. Convention Registrations
-- =============================================================================
INSERT INTO profile_conventions (profile_id, convention_id) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001'),
  -- Player also registered for FurFest East
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;


-- =============================================================================
-- 5. Test Fursuits (owned by fursuit-owner account)
-- =============================================================================
-- Temporarily disable the set_fursuit_owner trigger which overrides owner_id with auth.uid()
-- (auth.uid() is null in a seed/migration context)
ALTER TABLE fursuits DISABLE TRIGGER before_insert_fursuit_owner;

INSERT INTO fursuits (id, owner_id, name, unique_code, species_id, description, catch_mode) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'Blaze',    'TESTBLAZ', '3dd8af2c-26ec-4466-81e2-72eeed903a05', 'A fiery orange fox with a big bushy tail.',            'AUTO_ACCEPT'),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'Midnight', 'TESTMIDN', '7fad011a-2c8c-47b6-996a-6452f88d9767', 'A sleek black and silver wolf who loves the night.',   'AUTO_ACCEPT'),
  ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 'Patches',  'TESTPTCH', '0b15b671-e8c4-4450-8d3c-1eb035923a80', 'A colorful hybrid with spots of every color.',         'MANUAL_APPROVAL')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE fursuits ENABLE TRIGGER before_insert_fursuit_owner;


-- =============================================================================
-- 6. Fursuit Color Assignments
-- =============================================================================
INSERT INTO fursuit_color_assignments (fursuit_id, color_id, position) VALUES
  -- Blaze: Orange, Red
  ('cccccccc-0000-4000-8000-000000000001', 'baa0390f-6654-49a3-939d-86d13eab78a3', 1),
  ('cccccccc-0000-4000-8000-000000000001', '15e575d8-ae9f-4885-8a3e-37ac9cf7912e', 2),
  -- Midnight: Black, White
  ('cccccccc-0000-4000-8000-000000000002', '147a5a17-6019-4385-956c-340da1ce90e1', 1),
  ('cccccccc-0000-4000-8000-000000000002', 'a084df70-7eb1-4ffa-9a40-39164b9ba393', 2),
  -- Patches: Purple, Teal, Yellow
  ('cccccccc-0000-4000-8000-000000000003', 'f0e2ff9e-ef05-4d59-85e9-de9c3d655cdb', 1),
  ('cccccccc-0000-4000-8000-000000000003', '14505527-583d-4848-ba57-7f8307a586fc', 2),
  ('cccccccc-0000-4000-8000-000000000003', '6cb79681-1a80-448f-b193-ce392c7a1d93', 3)
ON CONFLICT DO NOTHING;


-- =============================================================================
-- 7. Fursuit Convention Registrations
-- =============================================================================
INSERT INTO fursuit_conventions (fursuit_id, convention_id) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001'),
  -- Blaze also at FurFest East
  ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;


-- =============================================================================
-- 8. Tags (NFC/QR linked to fursuits)
-- =============================================================================
-- Drop conflicting legacy constraint (nfc_tags_status_check) if it exists
-- The newer tags_status_check uses: registered, linked, unlinked, disabled
ALTER TABLE tags DROP CONSTRAINT IF EXISTS nfc_tags_status_check;

INSERT INTO tags (id, nfc_uid, fursuit_id, registered_by_user_id, status, qr_token, linked_at) VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'TEST-NFC-BLAZE-001',    'cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'linked', 'test-qr-blaze-001',    now()),
  ('dddddddd-0000-4000-8000-000000000002', 'TEST-NFC-MIDNIGHT-001', 'cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'linked', 'test-qr-midnight-001', now())
ON CONFLICT (id) DO NOTHING;


COMMIT;
