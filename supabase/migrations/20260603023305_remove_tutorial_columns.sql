drop view if exists public.catch_mode_default_experiment_results;
drop view if exists public.mv_convention_leaderboard;
drop view if exists public.mv_fursuit_popularity;
drop materialized view if exists public.mv_catches_hourly;
drop materialized view if exists public.mv_convention_daily_stats;

create table if not exists public.tutorial_fursuits (
  fursuit_id uuid primary key references public.fursuits(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

alter table public.tutorial_fursuits enable row level security;
revoke all on public.tutorial_fursuits from anon, authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fursuits'
      and column_name = 'is_tutorial'
  ) then
    execute '
      insert into public.tutorial_fursuits (fursuit_id)
      select id
      from public.fursuits
      where coalesce(is_tutorial, false) = true
      on conflict (fursuit_id) do nothing
    ';
  end if;
end $$;

create or replace function public.is_tutorial_fursuit(p_fursuit_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from public.tutorial_fursuits
    where tutorial_fursuits.fursuit_id = p_fursuit_id
  );
$$;

grant execute on function public.is_tutorial_fursuit(uuid) to authenticated, service_role;

create or replace function public.count_user_fursuits(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select count(*)::integer
  from public.fursuits
  where owner_id = p_user_id
    and not public.is_tutorial_fursuit(id);
$$;

drop policy if exists "Users can insert their own fursuits with limit"
  on public.fursuits;

alter table public.catches
  drop column if exists is_tutorial;

alter table public.fursuits
  drop column if exists is_tutorial;

create policy "Users can insert their own fursuits with limit"
on public.fursuits
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and not public.is_tutorial_fursuit(id)
  and public.count_user_fursuits(auth.uid()) < 5
);

create materialized view public.mv_catches_hourly as
select
  convention_id,
  date_trunc('hour'::text, caught_at) as hour_bucket,
  count(*) as catch_count,
  count(distinct catcher_id) as unique_catchers,
  count(distinct fursuit_id) as unique_fursuits,
  avg(extract(epoch from (decided_at - caught_at))) as avg_approval_seconds
from public.catches
where status = 'ACCEPTED'::text
  and not exists (
    select 1
    from public.audit_log
    where audit_log.entity_type = 'catch'::text
      and audit_log.entity_id = catches.id
      and audit_log.action = 'simulate_catch'::text
  )
group by convention_id, date_trunc('hour'::text, caught_at);

create materialized view public.mv_convention_daily_stats as
select
  convention_id,
  date_trunc('day'::text, caught_at) as day_bucket,
  count(*) as total_catches,
  count(distinct catcher_id) as active_players,
  count(distinct fursuit_id) as active_fursuits,
  count(*) filter (where status = 'PENDING'::text) as pending_count,
  count(*) filter (where status = 'REJECTED'::text) as rejected_count
from public.catches
group by convention_id, date_trunc('day'::text, caught_at);

create index idx_catches_hourly_convention
  on public.mv_catches_hourly using btree (convention_id);

create unique index uq_catches_hourly
  on public.mv_catches_hourly using btree (convention_id, hour_bucket);

create index idx_daily_stats_convention
  on public.mv_convention_daily_stats using btree (convention_id);

create unique index uq_convention_daily_stats
  on public.mv_convention_daily_stats using btree (convention_id, day_bucket);

create or replace view public.mv_convention_leaderboard
with (security_invoker = false)
as
select
  c.catcher_id,
  c.convention_id,
  p.username,
  count(*) as catch_count,
  count(distinct c.fursuit_id) as unique_fursuits,
  count(distinct f.species_id) as unique_species,
  max(c.caught_at) as last_catch_at,
  min(c.caught_at) as first_catch_at
from public.catches c
join public.profiles p on p.id = c.catcher_id
left join public.fursuits f on f.id = c.fursuit_id
where c.status = 'ACCEPTED'::text
group by c.catcher_id, c.convention_id, p.username;

create or replace view public.mv_fursuit_popularity
with (security_invoker = false)
as
select
  c.fursuit_id,
  c.convention_id,
  f.name as fursuit_name,
  f.avatar_url as fursuit_avatar_url,
  f.owner_id,
  count(*) as catch_count,
  count(distinct c.catcher_id) as unique_catchers,
  max(c.caught_at) as last_caught_at,
  min(c.caught_at) as first_caught_at
from public.catches c
join public.fursuits f on f.id = c.fursuit_id
where c.status = 'ACCEPTED'::text
group by c.fursuit_id, c.convention_id, f.name, f.avatar_url, f.owner_id;

create or replace view public.catch_mode_default_experiment_results
with (security_invoker = false)
as
with assignments as (
  select
    ea.experiment_key,
    ea.subject_id as profile_id,
    ea.variant,
    ea.assigned_at,
    ea.first_exposed_at,
    ea.default_applied_at,
    p.default_catch_mode as current_catch_mode,
    p.catch_mode_preference_source as current_preference_source,
    case
      when ea.variant = 'manual_default' then 'MANUAL_APPROVAL'
      else 'AUTO_ACCEPT'
    end as variant_catch_mode
  from public.experiment_assignments ea
  join public.profiles p on p.id = ea.subject_id
  where ea.experiment_key = 'catch_mode_default_v1'
    and ea.subject_type = 'profile'
),
fursuits_after_exposure as (
  select
    a.variant,
    count(f.id)::integer as fursuits_created_after_exposure
  from assignments a
  join public.fursuits f
    on f.owner_id = a.profile_id
   and a.first_exposed_at is not null
   and f.created_at >= a.first_exposed_at
  group by a.variant
),
catches_after_exposure as (
  select
    a.variant,
    count(c.id)::integer as catches_after_exposure,
    count(c.id) filter (where c.status = 'ACCEPTED')::integer as accepted_catches_after_exposure,
    count(c.id) filter (where c.status = 'PENDING')::integer as pending_catches_after_exposure
  from assignments a
  join public.fursuits f on f.owner_id = a.profile_id
  join public.catches c
    on c.fursuit_id = f.id
   and a.first_exposed_at is not null
   and c.caught_at >= a.first_exposed_at
  group by a.variant
)
select
  a.experiment_key,
  a.variant,
  count(*)::integer as assigned_profiles,
  count(*) filter (where a.first_exposed_at is not null)::integer as exposed_profiles,
  count(*) filter (where a.default_applied_at is not null)::integer as defaults_applied,
  count(*) filter (where a.current_catch_mode = 'AUTO_ACCEPT')::integer as current_auto_profiles,
  count(*) filter (where a.current_catch_mode = 'MANUAL_APPROVAL')::integer as current_manual_profiles,
  count(*) filter (
    where a.default_applied_at is not null
      and a.current_catch_mode <> a.variant_catch_mode
  )::integer as switched_away_profiles,
  coalesce(
    round(
      (
        count(*) filter (
          where a.default_applied_at is not null
            and a.current_catch_mode <> a.variant_catch_mode
        )::numeric
        / nullif(count(*) filter (where a.default_applied_at is not null), 0)
      ) * 100,
      1
    ),
    0
  ) as switch_away_rate,
  coalesce(f.fursuits_created_after_exposure, 0) as fursuits_created_after_exposure,
  coalesce(c.catches_after_exposure, 0) as catches_after_exposure,
  coalesce(c.accepted_catches_after_exposure, 0) as accepted_catches_after_exposure,
  coalesce(c.pending_catches_after_exposure, 0) as pending_catches_after_exposure
from assignments a
left join fursuits_after_exposure f on f.variant = a.variant
left join catches_after_exposure c on c.variant = a.variant
group by
  a.experiment_key,
  a.variant,
  f.fursuits_created_after_exposure,
  c.catches_after_exposure,
  c.accepted_catches_after_exposure,
  c.pending_catches_after_exposure;

revoke all on public.catch_mode_default_experiment_results from anon, authenticated;
grant select on public.catch_mode_default_experiment_results to service_role;
