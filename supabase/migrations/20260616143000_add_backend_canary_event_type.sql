insert into public.allowed_event_types (event_type, description, is_active)
values (
  'backend_canary',
  'Service-only post-deploy verification event for backend event processing',
  true
)
on conflict (event_type) do update
set
  description = excluded.description,
  is_active = true,
  deprecated_at = null;
