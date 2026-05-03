-- =============================================================================
-- TailTag Reference Seed Data
-- =============================================================================
-- Lookup/config data that must exist in every environment for the app to work.
-- Applied to dev, staging, AND production.
--
-- Insert order respects FK dependencies:
--   1. fursuit_colors, fursuit_species, allowed_event_types (no FKs)
--   2. achievement_rules (no FKs)
--   3. achievements (FK → achievement_rules)
--   4. daily_tasks (FK → achievement_rules, nullable)
--   5. edge_function_config (no FKs)
--
-- All inserts use ON CONFLICT DO NOTHING for idempotency.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Fursuit Colors (12 rows)
-- -----------------------------------------------------------------------------
INSERT INTO fursuit_colors (id, name, is_active) VALUES
  ('147a5a17-6019-4385-956c-340da1ce90e1', 'Black',  true),
  ('afbd263b-47d9-49d6-9494-61689bf45f88', 'Blue',   true),
  ('aad2e595-7475-43eb-b00b-18795865037f', 'Brown',  true),
  ('edd6f22b-b317-4fa2-af62-4d38fad4d9de', 'Gray',   true),
  ('ef2d9596-f8bc-489e-8c3f-f71baadc2267', 'Green',  true),
  ('baa0390f-6654-49a3-939d-86d13eab78a3', 'Orange', true),
  ('a0ee46b5-110b-464e-9ca2-999190bff178', 'Pink',   true),
  ('f0e2ff9e-ef05-4d59-85e9-de9c3d655cdb', 'Purple', true),
  ('15e575d8-ae9f-4885-8a3e-37ac9cf7912e', 'Red',    true),
  ('14505527-583d-4848-ba57-7f8307a586fc', 'Teal',   true),
  ('a084df70-7eb1-4ffa-9a40-39164b9ba393', 'White',  true),
  ('6cb79681-1a80-448f-b193-ce392c7a1d93', 'Yellow', true)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Fursuit Species (30 rows — excludes test entries: Test, Text, Ott, Sea)
-- -----------------------------------------------------------------------------
INSERT INTO fursuit_species (id, name) VALUES
  ('4dbecede-be06-4d48-927e-2bc23490b263', 'Bat'),
  ('33445257-e85b-476a-aa60-9af95f1b509a', 'Bear'),
  ('736eb7d0-e546-4a6b-a63f-6a9e946df47f', 'Bird'),
  ('9253db2b-22c1-4f44-bbb0-1d668da31f27', 'Cat'),
  ('0f7ea224-f6e7-4faf-98f1-b016da7b08b0', 'Cow'),
  ('69e58d2a-0175-4679-b1b9-d990d4ca9188', 'Coyote'),
  ('e5ce63e6-80cc-4794-ab54-3cdf960d98de', 'Deer'),
  ('060e4d9e-cd65-4aa2-adb5-aa9008f7b547', 'Dog'),
  ('e4de7e0e-a2e3-460d-9677-9ec1155bccee', 'Dragon'),
  ('73eec3fb-34e6-42d8-8bc1-5b95d969e3c9', 'Dutch Angel Dragon'),
  ('ad5f6093-8957-4e18-8b86-0b354c2e4b0d', 'Elk'),
  ('3dd8af2c-26ec-4466-81e2-72eeed903a05', 'Fox'),
  ('d76934a9-a5e5-48f7-9b38-b6ac7958a14b', 'Goat'),
  ('5dd41cca-40e2-4c5f-a739-51cda1c8e520', 'Horse'),
  ('e6719110-8c58-4a95-a804-6b8a10a4782b', 'Husky'),
  ('0b15b671-e8c4-4450-8d3c-1eb035923a80', 'Hybrid'),
  ('e392ed02-806b-4f77-b216-56e2f615a94b', 'Hyena'),
  ('1e78208e-4b76-480e-8ecd-3db05b48c51d', 'Kangaroo'),
  ('2e88a104-4485-4430-97d7-54709ce9d112', 'Lion'),
  ('c4826258-9b29-4fe4-a894-52e2e40877f9', 'Mouse'),
  ('eaf47f73-e6ad-491d-947a-532411727225', 'Otter'),
  ('987634a0-475c-4a1c-9870-38dbcb459efb', 'Panther'),
  ('e54b2512-9ed6-45f1-9725-5cb7ddf96456', 'Protogen'),
  ('1fda03d5-7e04-45b8-84cf-0db6dbb0a5b7', 'Rabbit'),
  ('3cf4eb8e-6f11-4a20-85f0-fc5bdddf42fa', 'Raccoon'),
  ('7cae9cfa-6634-4fc9-b27e-0537f0183d59', 'Sergal'),
  ('934d8933-e050-4b7c-9d1f-7156ad573be3', 'Shark'),
  ('8a711256-7192-4f2d-adc8-1b76573d9cc1', 'Snow Leopard'),
  ('929e31cc-7540-4874-bfcb-4a625335b1de', 'Tiger'),
  ('7fad011a-2c8c-47b6-996a-6452f88d9767', 'Wolf')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Allowed Event Types (23 rows)
-- -----------------------------------------------------------------------------
INSERT INTO allowed_event_types (event_type, description, is_active) VALUES
  ('achievement_unlocked',       'User unlocked an achievement (internal event)',           true),
  ('all_daily_tasks_completed',  'User completed all daily tasks for the day',              true),
  ('catch_confirmed',            'Fursuit owner confirmed a pending catch',                 true),
  ('catch_expired',              'Pending catch request expired',                           true),
  ('catch_pending',              'Catch created and awaiting owner approval',               true),
  ('catch_performed',            'User performed a catch (scanned/photographed a fursuit)', true),
  ('catch_rejected',             'Fursuit owner rejected a catch request',                  true),
  ('catch_shared',               'Catch shared event for daily task tracking',              true),
  ('convention_joined',          'User joined a convention',                                true),
  ('convention_left',            'User left a convention',                                  true),
  ('daily_reset',                'Daily tasks rotated for a convention',                    true),
  ('daily_task_completed',       'User completed a daily task',                             true),
  ('fursuit_bio_viewed',         'Fursuit bio view event for daily task tracking',          true),
  ('fursuit_convention_joined',  'Fursuit joined a convention roster',                      true),
  ('fursuit_convention_left',    'Fursuit left a convention roster',                        true),
  ('fursuit_created',            'User created a new fursuit',                              true),
  ('fursuit_deleted',            'User deleted a fursuit',                                  true),
  ('fursuit_updated',            'User updated fursuit details',                            true),
  ('leaderboard_refreshed',     'Leaderboard refresh event for daily task tracking',        true),
  ('nfc_scan',                   'NFC scan event audit record',                             true),
  ('onboarding_completed',       'User completed onboarding',                               true),
  ('profile_created',            'User profile was created',                                true),
  ('profile_updated',            'User updated their profile',                              true)
ON CONFLICT (event_type) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Achievement Rules (25 rows) — inserted before achievements & daily_tasks
-- -----------------------------------------------------------------------------
INSERT INTO achievement_rules (rule_id, kind, slug, name, description, is_active, version, rule, metadata) VALUES
  ('45e0e7a2-49b3-4bf4-9994-b3f6f172fab3', 'permanent', 'first_catch',        'FIRST_CATCH',             'Catch your first fursuit.',                    true, 1, '{"event_type":"catch_performed","required_stats":["totalCatches"]}',                '{"can_run_client":true,"required_stats":["totalCatches"],"achievement_key":"FIRST_CATCH"}'),
  ('96b3ec2e-a5eb-4ad6-9cd5-18ea3871d84e', 'permanent', 'getting_the_hang',   'GETTING_THE_HANG_OF_IT',  'Log 10 catches.',                              true, 1, '{"event_type":"catch_performed","required_stats":["totalCatches"]}',                '{"can_run_client":true,"required_stats":["totalCatches"],"achievement_key":"GETTING_THE_HANG_OF_IT"}'),
  ('1ebdab1b-ab4d-4817-b8dc-aa4838179285', 'permanent', 'super_catcher',      'SUPER_CATCHER',           'Log 25 catches.',                              true, 1, '{"event_type":"catch_performed","required_stats":["totalCatches"]}',                '{"can_run_client":true,"required_stats":["totalCatches"],"achievement_key":"SUPER_CATCHER"}'),
  ('bf030bc9-0e33-464d-81e2-e79251581708', 'permanent', 'debut_performance',  'DEBUT_PERFORMANCE',       'Your suit is caught for the first time.',       true, 1, '{"event_type":"catch_performed","required_stats":["totalFursuitCatches"]}',         '{"can_run_client":false,"required_stats":["totalFursuitCatches"],"achievement_key":"DEBUT_PERFORMANCE"}'),
  ('a23a1808-81fe-4e94-8b41-d3bf917b1139', 'permanent', 'day_one_devotee',    'DAY_ONE_DEVOTEE',         'Catch on day one of a convention.',             true, 1, '{"event_type":"catch_performed","required_stats":[]}',                              '{"can_run_client":false,"required_stats":[],"achievement_key":"DAY_ONE_DEVOTEE"}'),
  ('d1c2c753-64b7-4cb7-a2a8-c354a517134f', 'permanent', 'night_owl',          'NIGHT_OWL',               'Catch after 10pm local time.',                  true, 1, '{"event_type":"catch_performed","required_stats":[]}',                              '{"can_run_client":false,"required_stats":[],"achievement_key":"NIGHT_OWL"}'),
  ('95a8c55d-3a5b-4951-b7a3-653ff3e51efc', 'permanent', 'suit_sampler',       'SUIT_SAMPLER',            'Catch five distinct species.',                  true, 1, '{"event_type":"catch_performed","required_stats":["distinctSpeciesCaught"]}',       '{"can_run_client":false,"required_stats":["distinctSpeciesCaught"],"achievement_key":"SUIT_SAMPLER"}'),
  ('e543115a-608e-44ad-97fb-67e449bad553', 'permanent', 'mix_and_match',      'MIX_AND_MATCH',           'Catch a hybrid suit.',                          true, 1, '{"event_type":"catch_performed","required_stats":[]}',                              '{"can_run_client":false,"required_stats":[],"achievement_key":"MIX_AND_MATCH"}'),
  ('5e43b587-5bad-4ca7-a121-a014d15ea26c', 'permanent', 'hybrid_vibes',       'HYBRID_VIBES',            'Your hybrid suit gets caught.',                 true, 1, '{"event_type":"catch_performed","required_stats":[]}',                              '{"can_run_client":false,"required_stats":[],"achievement_key":"HYBRID_VIBES"}'),
  ('ddc332ac-80ae-4e97-a8be-af838c14d9b4', 'permanent', 'double_trouble',     'DOUBLE_TROUBLE',          'Catch twice within a minute.',                  true, 1, '{"event_type":"catch_performed","required_stats":[]}',                              '{"can_run_client":false,"required_stats":[],"achievement_key":"DOUBLE_TROUBLE"}'),
  ('10d37ae2-7986-412e-85cf-92c0e7b623b0', 'permanent', 'fan_favorite',       'FAN_FAVORITE',            'Your suit is caught 25+ times at one con.',     true, 1, '{"event_type":"catch_performed","required_stats":["catchesAtConvention"]}',         '{"can_run_client":false,"required_stats":["catchesAtConvention"],"achievement_key":"FAN_FAVORITE"}'),
  ('d0dd8b94-e582-4119-b603-ea4f601f53f8', 'permanent', 'rare_find',          'RARE_FIND',               'Catch a suit seen by fewer than 10 people.',    true, 1, '{"event_type":"catch_performed","required_stats":["uniqueCatchersAtConvention"]}',  '{"can_run_client":false,"required_stats":["uniqueCatchersAtConvention"],"achievement_key":"RARE_FIND"}'),
  ('dcb50d88-cdf8-4fad-ad65-619411b296bb', 'permanent', 'world_tour',         'WORLD_TOUR',              'Catch at three conventions.',                   true, 1, '{"event_type":"catch_performed","required_stats":["distinctConventionsVisited"]}',  '{"can_run_client":false,"required_stats":["distinctConventionsVisited"],"achievement_key":"WORLD_TOUR"}'),
  ('652559dd-8a5b-4baf-be8c-9a82575d8a33', 'permanent', 'profile_complete',   'PROFILE_COMPLETE',        'Complete your profile.',                        true, 1, '{"event_type":"profile_updated","required_stats":[]}',                              '{"can_run_client":true,"required_stats":[],"achievement_key":"PROFILE_COMPLETE"}'),
  ('f5660d76-b4a3-4c61-96c0-fb5853cefb4b', 'permanent', 'explorer',           'EXPLORER',                'Join a convention.',                            true, 1, '{"event_type":"convention_joined","required_stats":[]}',                            '{"can_run_client":true,"required_stats":[],"achievement_key":"EXPLORER"}'),
  ('dfa81678-0457-4c27-b406-dea9c04480b4', 'permanent', 'getting_started',    'getting_started',         'Finish onboarding.',                            true, 1, '{"event_type":"onboarding_completed","required_stats":[]}',                         '{"can_run_client":true,"required_stats":[],"achievement_key":"getting_started"}'),
  ('f1a7b000-0000-4000-8000-000000000001', 'permanent', 'first_fan',          'First Fan',               'One of your suits has been caught by 3 unique people',                              true, 1, '{}', '{}'),
  ('f1a7b000-0000-4000-8000-000000000002', 'permanent', 'opening_number',     'Opening Number',          'One of your suits was caught on day one of a convention',                           true, 1, '{}', '{}'),
  ('f1a7b000-0000-4000-8000-000000000003', 'permanent', 'weekend_warrior',    'Weekend Warrior',         'One of your suits was caught on 2 different days at the same convention',           true, 1, '{}', '{}'),
  ('f1a7b000-0000-4000-8000-000000000004', 'permanent', 'road_trip',          'Road Trip',               'One of your suits has been caught at 2 different conventions',                      true, 1, '{}', '{}'),
  ('f1a7b000-0000-4000-8000-000000000005', 'permanent', 'photo_op',           'Photo Op',                'One of your suits received a catch with a photo attached',                          true, 1, '{}', '{}'),
  ('f1a7b000-0000-4000-8000-000000000006', 'permanent', 'early_bird',         'Early Bird',              'Make a catch before 9 AM local convention time',                                    true, 1, '{}', '{}'),
  ('f1a7b000-0000-4000-8000-000000000007', 'permanent', 'species_safari',     'Species Safari',          'Catch 10 distinct species',                                                         true, 1, '{}', '{}'),
  ('f1a7b000-0000-4000-8000-000000000008', 'permanent', 'social_butterfly',   'Social Butterfly',        'Make 5 accepted catches in a single local convention day',                          true, 1, '{}', '{}'),
  ('f1a7b000-0000-4000-8000-000000000009', 'permanent', 'achievement_hunter', 'Achievement Hunter',      'Unlock 10 real achievements',                                                       true, 1, '{}', '{}'),
  ('f0229fa6-015b-4b72-a563-90257a6db4ca', 'permanent', 'maker_match',        'MAKER_MATCH',             'Catch a fursuit from a maker that also made one of your suits.',                     true, 1, '{"event_type":"catch_performed","required_stats":["hasMakerMatchWithCatcherOwnedSuit"]}', '{"can_run_client":false,"required_stats":["hasMakerMatchWithCatcherOwnedSuit"],"achievement_key":"MAKER_MATCH"}'),
  ('738249c7-0b59-43d0-ae31-734787ff3781', 'permanent', 'con_floor_collector','CON_FLOOR_COLLECTOR',     'At one convention, catch fursuits from 5 different makers.',                        true, 1, '{"event_type":"catch_performed","required_stats":["distinctMakersCaughtAtConvention"]}',  '{"can_run_client":false,"required_stats":["distinctMakersCaughtAtConvention"],"achievement_key":"CON_FLOOR_COLLECTOR"}'),
  ('dacb8bdd-38bd-4a03-bfd4-ad317e931b18', 'permanent', 'self_made_supporter','SELF_MADE_SUPPORTER',     'Catch 3 distinct self-made fursuits.',                                              true, 1, '{"event_type":"catch_performed","required_stats":["distinctSelfMadeFursuitsCaught"]}',    '{"can_run_client":false,"required_stats":["distinctSelfMadeFursuitsCaught"],"achievement_key":"SELF_MADE_SUPPORTER"}')
ON CONFLICT (rule_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Achievements (25 rows) — FK → achievement_rules.rule_id
-- -----------------------------------------------------------------------------
INSERT INTO achievements (id, key, name, description, category, recipient_role, trigger_event, is_active, rule_id, reset_mode, reset_timezone, reset_grace_minutes, convention_id) VALUES
  ('d94c7d1e-81a6-4320-b996-ad9e99aedb30', 'FIRST_CATCH',             'First Catch',             'Catch your very first fursuiter.',                                           'catching',    'catcher',        'catch.created',     true, '45e0e7a2-49b3-4bf4-9994-b3f6f172fab3', 'none', 'UTC', 0, null),
  ('35fb98a3-f4c4-40b5-9451-35f3737b03ac', 'GETTING_THE_HANG_OF_IT',  'Getting the Hang of It',  'Catch 10 different fursuiters.',                                             'catching',    'catcher',        'catch.created',     true, '96b3ec2e-a5eb-4ad6-9cd5-18ea3871d84e', 'none', 'UTC', 0, null),
  ('71c1dec3-b6e4-4d8c-9673-be22838d6fed', 'SUPER_CATCHER',           'Super Catcher',           'Catch 25 fursuiters.',                                                       'catching',    'catcher',        'catch.created',     true, '1ebdab1b-ab4d-4817-b8dc-aa4838179285', 'none', 'UTC', 0, null),
  ('0f37e500-8472-4688-bb75-d2493a75de64', 'DEBUT_PERFORMANCE',       'Debut Performance',       'Have your fursuit caught for the first time.',                               'fursuiter',   'fursuit_owner',  'catch.created',     true, 'bf030bc9-0e33-464d-81e2-e79251581708', 'none', 'UTC', 0, null),
  ('a2534e7c-4fdd-4bc9-9bf8-a84d556aeb1f', 'DAY_ONE_DEVOTEE',         'Day One Devotee',         'Make a catch on the first day of a convention.',                             'dedication',  'catcher',        'catch.created',     true, 'a23a1808-81fe-4e94-8b41-d3bf917b1139', 'none', 'UTC', 0, null),
  ('64402fc0-c3b4-4a40-bec0-022d034b0446', 'NIGHT_OWL',               'Night Owl',               'Catch a fursuiter after 10 PM local time.',                                  'dedication',  'catcher',        'catch.created',     true, 'd1c2c753-64b7-4cb7-a2a8-c354a517134f', 'none', 'UTC', 0, null),
  ('ad835cdf-a848-4de0-a316-b2dbb3ebd8ad', 'SUIT_SAMPLER',            'Suit Sampler',            'Catch fursuiters from five different species.',                              'variety',     'catcher',        'catch.created',     true, '95a8c55d-3a5b-4951-b7a3-653ff3e51efc', 'none', 'UTC', 0, null),
  ('0924a336-8a0d-4170-bf14-30ced8511c92', 'MIX_AND_MATCH',           'Mix and Match',           'Catch a fursuit flagged as a hybrid or with multiple species tags.',          'variety',     'catcher',        'catch.created',     true, 'e543115a-608e-44ad-97fb-67e449bad553', 'none', 'UTC', 0, null),
  ('19be57d8-7178-4a6b-9346-fe4d6da73d2c', 'DOUBLE_TROUBLE',          'Double Trouble',          'Catch two fursuiters within one minute.',                                    'fun',         'catcher',        'catch.created',     true, 'ddc332ac-80ae-4e97-a8be-af838c14d9b4', 'none', 'UTC', 0, null),
  ('7dcfaf90-7f14-40c6-b1ac-613f3a40d17c', 'FAN_FAVORITE',            'Fan Favorite',            'Have your fursuit caught 25 times at a single convention.',                  'fursuiter',   'fursuit_owner',  'catch.created',     true, '10d37ae2-7986-412e-85cf-92c0e7b623b0', 'none', 'UTC', 0, null),
  ('ae60204d-f59e-4484-b92e-09e49f20cd8f', 'RARE_FIND',               'Rare Find',               'Catch a fursuiter who has been caught by fewer than ten people at that convention.', 'fun',   'catcher',        'catch.created',     true, 'd0dd8b94-e582-4119-b603-ea4f601f53f8', 'none', 'UTC', 0, null),
  ('9a9f841f-4f08-4383-b923-28b9b7803d4a', 'WORLD_TOUR',              'World Tour',              'Catch fursuiters at three different conventions.',                           'dedication',  'catcher',        'catch.created',     true, 'dcb50d88-cdf8-4fad-ad65-619411b296bb', 'none', 'UTC', 0, null),
  ('545ea10e-8e2b-4d39-b2f2-90f8121cf377', 'PROFILE_COMPLETE',        'Profile Complete',        'Fill out every required profile field.',                                     'meta',        'any',            'profile.updated',   true, '652559dd-8a5b-4baf-be8c-9a82575d8a33', 'none', 'UTC', 0, null),
  ('ae1008d6-3ec6-4136-999e-22c0f18af673', 'EXPLORER',                'Explorer',                'Check in to a convention you are attending.',                                'meta',        'any',            'convention.checkin', true, 'f5660d76-b4a3-4c61-96c0-fb5853cefb4b', 'none', 'UTC', 0, null),
  ('abeaebac-48bf-4a6d-b847-975b0b4b106e', 'getting_started',         'Getting Started',         'Complete the TailTag onboarding flow',                                       'meta',        'any',            'profile.updated',   true, 'dfa81678-0457-4c27-b406-dea9c04480b4', 'none', 'UTC', 0, null),
  ('b75d1c7a-9108-4c01-bbb8-5f7d91c118a2', 'HYBRID_VIBES',            'Hybrid Vibes',            'Have your hybrid or multi-species suit caught.',                             'fursuiter',   'fursuit_owner',  'catch.created',     true, '5e43b587-5bad-4ca7-a121-a014d15ea26c', 'none', 'UTC', 0, null),
  ('cf6fe16f-d188-4a23-b9d9-b5c49784a62b', 'OPENING_NUMBER',          'Opening Number',          'One of your suits was caught on day one of a convention',                    'fursuiter',   'fursuit_owner',  'catch_performed',   true, 'f1a7b000-0000-4000-8000-000000000002', 'none', 'UTC', 0, null),
  ('d5fd382b-e45f-47c3-bf6a-ba3e9fd7aa59', 'WEEKEND_WARRIOR',         'Weekend Warrior',         'One of your suits was caught on 2 different days at the same convention',    'fursuiter',   'fursuit_owner',  'catch_performed',   true, 'f1a7b000-0000-4000-8000-000000000003', 'none', 'UTC', 0, null),
  ('ea5ec8a0-ce0c-4a7c-b717-d746098e30f1', 'ROAD_TRIP',               'Road Trip',               'One of your suits has been caught at 2 different conventions',               'fursuiter',   'fursuit_owner',  'catch_performed',   true, 'f1a7b000-0000-4000-8000-000000000004', 'none', 'UTC', 0, null),
  ('8613fdfc-faa8-466e-8f91-d77835fc3720', 'PHOTO_OP',                'Photo Op',                'One of your suits received a catch with a photo attached',                   'fursuiter',   'fursuit_owner',  'catch_performed',   true, 'f1a7b000-0000-4000-8000-000000000005', 'none', 'UTC', 0, null),
  ('75d3ec8d-2e0d-46a8-b1cf-9e84477f4291', 'EARLY_BIRD',              'Early Bird',              'Make a catch before 9 AM local convention time',                             'dedication',  'catcher',        'catch_performed',   true, 'f1a7b000-0000-4000-8000-000000000006', 'none', 'UTC', 0, null),
  ('b9ac2e31-0655-41ad-970e-4f5d50d32309', 'SPECIES_SAFARI',          'Species Safari',          'Catch 10 distinct species',                                                  'variety',     'catcher',        'catch_performed',   true, 'f1a7b000-0000-4000-8000-000000000007', 'none', 'UTC', 0, null),
  ('8c20456d-ed75-46c5-8aab-fe996399d71e', 'ACHIEVEMENT_HUNTER',      'Achievement Hunter',      'Unlock 10 real achievements',                                                'meta',        'any',            'catch_performed',   true, 'f1a7b000-0000-4000-8000-000000000009', 'none', 'UTC', 0, null),
  ('cc312180-7809-4632-84a5-655cbaa0914f', 'SOCIAL_BUTTERFLY',        'Social Butterfly',        'Make 5 accepted catches in a single local convention day',                   'fun',         'catcher',        'catch_performed',   true, 'f1a7b000-0000-4000-8000-000000000008', 'none', 'UTC', 0, null),
  ('f03f504c-af2d-4ee0-a7e9-2bccbf8f5e89', 'FIRST_FAN',               'First Fan',               'One of your suits has been caught by 3 unique people',                       'fursuiter',   'fursuit_owner',  'catch_performed',   true, 'f1a7b000-0000-4000-8000-000000000001', 'none', 'UTC', 0, null),
  ('ffdb4dd3-86bd-48a7-b901-5613714313c4', 'MAKER_MATCH',             'Maker Match',             'Catch a fursuit from a maker that also made one of your suits.',             'variety',     'catcher',        'catch_performed',   true, 'f0229fa6-015b-4b72-a563-90257a6db4ca', 'none', 'UTC', 0, null),
  ('67c8644f-2dab-442f-9e5d-e8427c909c58', 'CON_FLOOR_COLLECTOR',     'Con Floor Collector',     'At one convention, catch fursuits from 5 different makers.',                'variety',     'catcher',        'catch_performed',   true, '738249c7-0b59-43d0-ae31-734787ff3781', 'none', 'UTC', 0, null),
  ('09959a69-a8fd-4faa-8744-1ba4bf383aa1', 'SELF_MADE_SUPPORTER',     'Self-Made Supporter',     'Catch 3 distinct self-made fursuits.',                                      'variety',     'catcher',        'catch_performed',   true, 'dacb8bdd-38bd-4a03-bfd4-ad317e931b18', 'none', 'UTC', 0, null)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. Daily Tasks (10 rows) — 2 inactive (share tasks), 8 active
-- -----------------------------------------------------------------------------
INSERT INTO daily_tasks (id, name, description, kind, requirement, metadata, is_active, rule_id, convention_id) VALUES
  ('e9c1d39b-1cf4-4a93-80f5-d428dd286560', 'Open the leaderboard',          'See who is leading the pack right now.',                   'leaderboard', 1,  '{"metric":"total","eventType":"leaderboard_refreshed","includeTutorialCatches":false}',                                                               true,  null, null),
  ('918258d9-651d-4e24-9c61-b4703ce4852e', 'Catch 1 suiter today',          'Kick off the day by catching any suiter.',                 'catch',       1,  '{"metric":"total","eventType":"catch_performed","includeTutorialCatches":false}',                                                                     true,  null, null),
  ('26139b89-a341-454a-bba8-3ff38c2f51ac', 'Catch 3 suiters today',         'Keep the momentum going with three total catches.',         'catch',       3,  '{"metric":"total","eventType":"catch_performed","includeTutorialCatches":false}',                                                                     true,  null, null),
  ('86765af1-77e8-4ca0-a3dc-51531dc9c6c2', 'Catch 10 suiters',              'Go on a catching spree by snagging ten suiters today.',     'catch',       10, '{"metric":"total","eventType":"catch_performed","includeTutorialCatches":false}',                                                                     true,  null, null),
  ('85a59e7b-6906-4b84-a133-95a25a1f2937', 'Catch 5 unique suiters',        'Track down five different suiters in a single day.',         'catch',       5,  '{"metric":"unique","uniqueBy":"payload.fursuit_id","eventType":"catch_performed","includeTutorialCatches":false}',                                    true,  null, null),
  ('c5914eb9-dbd2-41b0-8176-b98199e1eccf', 'Refresh the leaderboard twice', 'Check back in on the leaderboard a second time.',           'leaderboard', 2,  '{"metric":"total","eventType":"leaderboard_refreshed","includeTutorialCatches":false}',                                                               true,  null, null),
  ('395a6cc9-57fd-4b8a-8293-12a02118516e', 'Share a catch',                 'Show off your haul by sharing one of your catches.',         'share',       1,  '{"metric":"total","filters":[{"path":"payload.context","equals":"catch_screen"}],"eventType":"catch_shared"}',                                        false, null, null),
  ('cb5b3440-baba-49ab-8ece-d210b71208b2', 'Share two catches',             'Double up and share two catches today.',                     'share',       2,  '{"metric":"total","filters":[{"path":"payload.context","equals":"catch_screen"}],"eventType":"catch_shared"}',                                        false, null, null),
  ('190aa081-2120-4a89-8b5a-0ee0cb576ce2', 'View 1 suiter bio',             'Open any suiter bio to learn more about them.',              'view_bio',    1,  '{"metric":"total","filters":[{"path":"payload.owner_id","notEqualsUserId":true}],"eventType":"fursuit_bio_viewed","includeTutorialCatches":false}',    true,  null, null),
  ('61334de8-f453-488f-9a8f-35ded68483e3', 'View 3 suiter bios',            'Check out bios for three different suiters.',                'view_bio',    3,  '{"metric":"unique","filters":[{"path":"payload.owner_id","notEqualsUserId":true}],"uniqueBy":"payload.fursuit_id","eventType":"fursuit_bio_viewed","includeTutorialCatches":false}', true, null, null),
  ('8b5f9a7a-8d7d-4e89-9a92-4fd4b45b8b71', 'Same Studio',                  'Catch a suit from a maker that also made one of yours.',     'catch',       1,  '{"metric":"total","eventType":"catch_performed","includeTutorialCatches":false,"filters":[{"path":"payload.catcher_id","equalsUserId":true},{"path":"payload.has_catcher_owned_maker_match","equals":true}]}', true, null, null),
  ('3327bbbe-2c41-421d-ad0b-ed1c3fb22d60', 'Studio Sampler',               'Catch suits from two different makers today.',               'catch',       2,  '{"metric":"unique","uniqueBy":"payload.normalized_maker_names","eventType":"catch_performed","includeTutorialCatches":false,"filters":[{"path":"payload.catcher_id","equalsUserId":true},{"path":"payload.has_maker","equals":true}]}', true, null, null),
  ('ee1c9130-0db4-48cf-bbb6-64f965a563c7', 'Fresh Workshop',               'Catch a maker you have not caught earlier at this convention.', 'catch',    1,  '{"metric":"total","eventType":"catch_performed","includeTutorialCatches":false,"filters":[{"path":"payload.catcher_id","equalsUserId":true},{"path":"payload.is_new_maker_for_catcher_at_convention","equals":true}]}', true, null, null)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. Edge Function Config (18 rows — excludes deprecated: lookup-nfc-tag, register-nfc-tag)
-- -----------------------------------------------------------------------------
INSERT INTO edge_function_config (function_name, description, rate_limit_enabled, rate_limit_requests_per_minute, rate_limit_requests_per_hour, max_payload_size_bytes, validate_event_types, require_jwt, allowed_roles, is_deprecated, deprecation_date, replacement_function, config) VALUES
  ('create-catch',                                'Create catch with approval workflow',                            true,  30,   300,  10240, false, true,  '{"authenticated"}', false, null, null, '{}'),
  ('delete-account',                              'Account deletion cascade',                                       true,  5,    10,   1024,  false, true,  '{"authenticated"}', false, null, null, '{}'),
  ('events-ingress',                              'Event processing and achievements',                              true,  60,   1000, 10240, true,  true,  '{"authenticated"}', false, null, null, '{}'),
  ('expire-pending-catches',                      'Expire pending catches (cron)',                                   false, null, null, 1024,  false, true,  '{"authenticated"}', false, null, null, '{}'),
  ('gameplay_inline_processing_enabled',          'Reserved rollback flag for legacy inline gameplay processing',    false, null, null, 10240, true,  false, '{"service_role"}',  false, null, null, '{"value":false}'),
  ('gameplay_queue_batch_size',                   'Default gameplay queue worker batch size',                        false, null, null, 10240, true,  false, '{"service_role"}',  false, null, null, '{"value":25}'),
  ('gameplay_queue_enabled',                      'Enable durable PGMQ-backed gameplay event processing',           false, null, null, 10240, true,  false, '{"service_role"}',  false, null, null, '{"value":true}'),
  ('gameplay_queue_max_attempts',                 'Gameplay queue max read attempts before archive',                 false, null, null, 10240, true,  false, '{"service_role"}',  false, null, null, '{"value":8}'),
  ('gameplay_queue_visibility_timeout_seconds',   'Gameplay queue visibility timeout in seconds',                    false, null, null, 10240, true,  false, '{"service_role"}',  false, null, null, '{"value":30}'),
  ('gameplay_queue_wakeup_enabled',               'Enable producer-triggered queue drain wake-ups',                  false, null, null, 10240, true,  false, '{"service_role"}',  false, null, null, '{"value":true}'),
  ('gameplay_queue_wakeup_max_duration_ms',       'Maximum wall-clock time in milliseconds for a producer wake-up drain before it yields to cron recovery.', false, null, null, 10240, true, false, '{"service_role"}', false, null, null, '{"value":2500}'),
  ('gameplay_queue_wakeup_max_messages',          'Maximum number of gameplay queue messages a producer wake-up should attempt in one low-latency drain.',    false, null, null, 10240, true, false, '{"service_role"}', false, null, null, '{"value":6}'),
  ('legacy_event_processor_enabled',              'Feature flag for the dormant legacy process-achievements worker. Keep false unless performing a controlled rollback.', false, null, null, 10240, true, false, '{"service_role"}', false, null, null, '{"value":false}'),
  ('lookup-tag',                                  'Tag lookup for catches',                                         true,  30,   300,  2048,  false, true,  '{"authenticated"}', false, null, null, '{}'),
  ('register-tag',                                'NFC/QR tag registration',                                        true,  10,   100,  5120,  false, true,  '{"authenticated"}', false, null, null, '{}'),
  ('rotate-dailys',                               'Daily task rotation (cron)',                                      false, null, null, 1024,  false, true,  '{"authenticated"}', false, null, null, '{}'),
  ('send-push',                                   'Push notification handler',                                       true,  100,  1000, 5120,  false, true,  '{"authenticated"}', false, null, null, '{}'),
  ('sync-provider-avatar',                        'OAuth avatar sync',                                               true,  10,   50,   2048,  false, true,  '{"authenticated"}', false, null, null, '{}')
ON CONFLICT (function_name) DO NOTHING;

COMMIT;
