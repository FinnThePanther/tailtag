BEGIN;

INSERT INTO public.achievement_rules (
  rule_id,
  kind,
  slug,
  name,
  description,
  is_active,
  version,
  rule,
  metadata
)
VALUES (
  '9a12723b-f035-4f66-b47f-17cb9c3b1775',
  'permanent',
  'too_much_turbulence',
  'TOO_MUCH_TURBULENCE',
  'Catch all four Turbulence variants during Anthrocon 2026.',
  true,
  1,
  jsonb_build_object(
    'kind', 'fursuit_set_caught_at_convention',
    'event_type', 'catch_performed',
    'convention_id', '45002703-329b-482b-ac4b-ae525f5c6fdb',
    'starts_at', '2026-07-02T04:00:00Z',
    'ends_at', '2026-07-06T04:00:00Z',
    'fursuit_ids', jsonb_build_array(
      '5152cda8-a35f-4b3b-9a85-93529d3823bd',
      '69886b0b-f5ea-492a-a682-21ed8bdca2fb',
      '27f85156-7185-4d72-9509-fb9b173b2c76',
      '4aa98bbb-8491-4a69-b0d9-085c6904a8f2'
    ),
    'excluded_user_ids', jsonb_build_array(
      'ff81b2f8-3a23-4b33-9332-8172a993b40d'
    ),
    'xp_amount', 1000
  ),
  jsonb_build_object(
    'can_run_client', false,
    'achievement_key', 'TOO_MUCH_TURBULENCE',
    'event_exclusive', true,
    'event_slug', 'anthrocon-2026'
  )
)
ON CONFLICT (rule_id) DO UPDATE
SET
  kind = EXCLUDED.kind,
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  version = EXCLUDED.version,
  rule = EXCLUDED.rule,
  metadata = EXCLUDED.metadata,
  updated_at = timezone('utc'::text, now());

INSERT INTO public.achievements (
  id,
  key,
  name,
  description,
  category,
  recipient_role,
  trigger_event,
  is_active,
  rule_id,
  reset_mode,
  reset_timezone,
  reset_grace_minutes,
  convention_id
)
SELECT
  '435709e4-8420-43e7-9abe-65473fb671b2',
  'TOO_MUCH_TURBULENCE',
  'Too Much Turbulence',
  'Caught all four Turbulence variants during Anthrocon 2026.',
  'fun',
  'catcher',
  'catch_performed',
  true,
  '9a12723b-f035-4f66-b47f-17cb9c3b1775',
  'none',
  'America/New_York',
  0,
  '45002703-329b-482b-ac4b-ae525f5c6fdb'
WHERE EXISTS (
  SELECT 1
  FROM public.conventions
  WHERE id = '45002703-329b-482b-ac4b-ae525f5c6fdb'
)
ON CONFLICT (id) DO UPDATE
SET
  key = EXCLUDED.key,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  recipient_role = EXCLUDED.recipient_role,
  trigger_event = EXCLUDED.trigger_event,
  is_active = EXCLUDED.is_active,
  rule_id = EXCLUDED.rule_id,
  reset_mode = EXCLUDED.reset_mode,
  reset_timezone = EXCLUDED.reset_timezone,
  reset_grace_minutes = EXCLUDED.reset_grace_minutes,
  convention_id = EXCLUDED.convention_id,
  updated_at = timezone('utc'::text, now());

INSERT INTO public.fursuit_conventions (
  fursuit_id,
  convention_id,
  roster_visible,
  roster_state,
  removed_at,
  active_until,
  finalized_at
)
SELECT
  '5152cda8-a35f-4b3b-9a85-93529d3823bd',
  '45002703-329b-482b-ac4b-ae525f5c6fdb',
  true,
  'active',
  NULL,
  NULL,
  NULL
WHERE EXISTS (
  SELECT 1
  FROM public.conventions
  WHERE id = '45002703-329b-482b-ac4b-ae525f5c6fdb'
)
AND EXISTS (
  SELECT 1
  FROM public.fursuits
  WHERE id = '5152cda8-a35f-4b3b-9a85-93529d3823bd'
)
ON CONFLICT (fursuit_id, convention_id) DO UPDATE
SET
  roster_visible = true,
  roster_state = 'active',
  removed_at = NULL,
  active_until = NULL,
  finalized_at = NULL;

COMMIT;
