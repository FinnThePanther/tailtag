update public.daily_tasks
set
  name = 'Catch 10 suiters today'
where id = '86765af1-77e8-4ca0-a3dc-51531dc9c6c2';

update public.daily_tasks
set
  is_active = false,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'defaultRotationEligible', false,
    'rotationPool', 'special'
  )
where id in (
  '8b5f9a7a-8d7d-4e89-9a92-4fd4b45b8b71',
  '3327bbbe-2c41-421d-ad0b-ed1c3fb22d60',
  'ee1c9130-0db4-48cf-bbb6-64f965a563c7'
);

update public.daily_tasks
set
  is_active = false,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'defaultRotationEligible', false,
    'rotationPool', 'special'
  )
where metadata ->> 'sourceTaskId' in (
  '8b5f9a7a-8d7d-4e89-9a92-4fd4b45b8b71',
  '3327bbbe-2c41-421d-ad0b-ed1c3fb22d60',
  'ee1c9130-0db4-48cf-bbb6-64f965a563c7'
);
