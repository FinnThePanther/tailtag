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
    'a0aa9a53-0a7b-4bf7-a7a3-e6f2a84feac2',
    'Catch 2 suiters today',
    'Build momentum by catching two suiters.',
    'catch',
    2,
    '{"metric":"total","eventType":"catch_performed","rotation":{"eligible":true,"slot":"catch","difficulty":"easy","family":"catch_volume"},"leveling":{"xp":35}}'::jsonb,
    true,
    null,
    null
  ),
  (
    'df526046-9edc-4fff-8b35-efa3a8658b9d',
    'Catch 4 suiters today',
    'Keep the con floor energy going with four catches.',
    'catch',
    4,
    '{"metric":"total","eventType":"catch_performed","rotation":{"eligible":true,"slot":"catch","difficulty":"medium","family":"catch_volume"},"leveling":{"xp":60}}'::jsonb,
    true,
    null,
    null
  ),
  (
    '416199d2-3cec-45c6-a52c-0699a1688e81',
    'Catch 2 unique suiters',
    'Catch two different suiters today.',
    'catch',
    2,
    '{"metric":"unique","uniqueBy":"payload.fursuit_id","eventType":"catch_performed","rotation":{"eligible":true,"slot":"catch","difficulty":"easy","family":"catch_unique"},"leveling":{"xp":35}}'::jsonb,
    true,
    null,
    null
  ),
  (
    '0eee75c3-275c-406c-9e00-763c0dff9443',
    'Catch 3 unique suiters',
    'Catch three different suiters today.',
    'catch',
    3,
    '{"metric":"unique","uniqueBy":"payload.fursuit_id","eventType":"catch_performed","rotation":{"eligible":true,"slot":"catch","difficulty":"medium","family":"catch_unique"},"leveling":{"xp":50}}'::jsonb,
    true,
    null,
    null
  ),
  (
    '04cebb38-d2d1-49e7-a1c9-3caefb454ce7',
    'View 2 suiter bios',
    'Open two suiter bios and learn who is around.',
    'view_bio',
    2,
    '{"metric":"unique","filters":[{"path":"payload.owner_id","notEqualsUserId":true}],"uniqueBy":"payload.fursuit_id","eventType":"fursuit_bio_viewed","rotation":{"eligible":true,"slot":"explore","difficulty":"easy","family":"bio_views"},"leveling":{"xp":45}}'::jsonb,
    true,
    null,
    null
  ),
  (
    'c65a5c84-89a9-486b-b702-d5f3c2e41a1a',
    'View 5 suiter bios',
    'Browse five different suiter bios in one day.',
    'view_bio',
    5,
    '{"metric":"unique","filters":[{"path":"payload.owner_id","notEqualsUserId":true}],"uniqueBy":"payload.fursuit_id","eventType":"fursuit_bio_viewed","rotation":{"eligible":true,"slot":"explore","difficulty":"hard","family":"bio_views"},"leveling":{"xp":80}}'::jsonb,
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
