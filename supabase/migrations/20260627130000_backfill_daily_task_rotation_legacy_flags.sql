UPDATE public.daily_tasks
SET metadata = metadata || '{"defaultRotationEligible":false}'::jsonb
WHERE id IN (
  '86765af1-77e8-4ca0-a3dc-51531dc9c6c2',
  'c5914eb9-dbd2-41b0-8176-b98199e1eccf',
  '395a6cc9-57fd-4b8a-8293-12a02118516e',
  'cb5b3440-baba-49ab-8ece-d210b71208b2'
);

UPDATE public.daily_tasks
SET metadata = metadata || '{"defaultRotationEligible":false,"rotationPool":"special"}'::jsonb
WHERE id IN (
  '8b5f9a7a-8d7d-4e89-9a92-4fd4b45b8b71',
  '3327bbbe-2c41-421d-ad0b-ed1c3fb22d60',
  'ee1c9130-0db4-48cf-bbb6-64f965a563c7'
);
