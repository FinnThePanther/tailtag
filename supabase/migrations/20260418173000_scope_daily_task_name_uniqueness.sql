-- Convention-scoped daily tasks can reuse the same display names across
-- conventions. Keep global task names unique, and keep convention task names
-- unique only inside their convention.

alter table public.daily_tasks
  drop constraint if exists daily_tasks_name_key;

drop index if exists public.daily_tasks_name_key;
drop index if exists public.daily_tasks_global_name_key;
drop index if exists public.daily_tasks_convention_name_key;

create unique index daily_tasks_global_name_key
  on public.daily_tasks using btree (name)
  where convention_id is null;

create unique index daily_tasks_convention_name_key
  on public.daily_tasks using btree (convention_id, name)
  where convention_id is not null;
