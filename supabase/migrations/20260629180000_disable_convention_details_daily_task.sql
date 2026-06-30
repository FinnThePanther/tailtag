UPDATE public.daily_tasks
SET
  is_active = false,
  metadata = jsonb_set(
    metadata,
    '{rotation,eligible}',
    'false'::jsonb,
    true
  )
WHERE id = '13208a7a-f005-4640-bf91-475ad241db63';
