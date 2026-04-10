-- Improve catch/event perceived latency by allowing producer wakeups
-- to drain more of the gameplay queue per invocation.

insert into public.edge_function_config (
  function_name,
  description,
  config
)
values
  (
    'gameplay_queue_wakeup_max_messages',
    'Maximum number of gameplay queue messages a producer wake-up should attempt in one low-latency drain.',
    jsonb_build_object('value', 20)
  ),
  (
    'gameplay_queue_wakeup_max_duration_ms',
    'Maximum wall-clock time in milliseconds for a producer wake-up drain before it yields to cron recovery.',
    jsonb_build_object('value', 7000)
  )
on conflict (function_name) do update
set
  description = excluded.description,
  config = excluded.config,
  updated_at = now();
