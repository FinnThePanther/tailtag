create index if not exists catch_performance_events_user_created_at_idx
  on public.catch_performance_events (user_id, created_at desc)
  where user_id is not null;

create index if not exists catch_performance_events_catch_id_idx
  on public.catch_performance_events (catch_id)
  where catch_id is not null;
