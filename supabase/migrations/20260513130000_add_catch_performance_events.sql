create table if not exists public.catch_performance_events (
  id uuid primary key default gen_random_uuid(),
  client_attempt_id text not null,
  user_id uuid null references public.profiles(id) on delete set null,
  catch_id uuid null references public.catches(id) on delete set null,
  convention_id uuid null references public.conventions(id) on delete set null,
  method text not null,
  result text not null,
  total_ms integer null,
  timings jsonb not null default '{}'::jsonb,
  app_version text null,
  platform text null,
  network_type text null,
  error_code text null,
  created_at timestamptz not null default now()
);

alter table public.catch_performance_events enable row level security;

revoke all on table public.catch_performance_events from anon;
revoke all on table public.catch_performance_events from authenticated;
grant all on table public.catch_performance_events to service_role;

create index if not exists catch_performance_events_created_at_idx
  on public.catch_performance_events (created_at desc);

create index if not exists catch_performance_events_method_created_at_idx
  on public.catch_performance_events (method, created_at desc);

create index if not exists catch_performance_events_convention_created_at_idx
  on public.catch_performance_events (convention_id, created_at desc)
  where convention_id is not null;
