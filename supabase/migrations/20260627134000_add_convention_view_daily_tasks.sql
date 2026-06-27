INSERT INTO public.allowed_event_types (event_type, description, is_active)
VALUES
  (
    'convention_detail_viewed',
    'Convention detail view event for daily task tracking',
    true
  ),
  (
    'convention_roster_viewed',
    'Convention roster view event for daily task tracking',
    true
  )
ON CONFLICT (event_type) DO UPDATE
SET
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

INSERT INTO public.daily_tasks (
  id,
  name,
  description,
  kind,
  requirement,
  metadata,
  is_active,
  rule_id,
  convention_id
) VALUES
  (
    '8a1d69ee-2d01-4c7f-8c46-b1641e304eb8',
    'Check your convention roster',
    'Open the fursuit roster for your convention.',
    'view_bio',
    1,
    '{"metric":"total","eventType":"convention_roster_viewed","rotation":{"eligible":true,"slot":"explore","difficulty":"easy","family":"roster_view"},"leveling":{"xp":25}}'::jsonb,
    true,
    null,
    null
  ),
  (
    '13208a7a-f005-4640-bf91-475ad241db63',
    'Open convention details',
    'Check the current details for your convention.',
    'view_bio',
    1,
    '{"metric":"total","eventType":"convention_detail_viewed","rotation":{"eligible":true,"slot":"explore","difficulty":"easy","family":"convention_view"},"leveling":{"xp":25}}'::jsonb,
    true,
    null,
    null
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  kind = EXCLUDED.kind,
  requirement = EXCLUDED.requirement,
  metadata = EXCLUDED.metadata,
  is_active = EXCLUDED.is_active,
  rule_id = EXCLUDED.rule_id,
  convention_id = EXCLUDED.convention_id;
