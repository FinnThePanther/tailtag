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
