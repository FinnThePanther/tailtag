alter table public.profiles
  add column if not exists catch_mode_preference_source text not null default 'system_default';

update public.profiles
set default_catch_mode = 'AUTO_ACCEPT'
where default_catch_mode not in ('AUTO_ACCEPT', 'MANUAL_APPROVAL');

alter table public.profiles
  drop constraint if exists profiles_default_catch_mode_check;

alter table public.profiles
  add constraint profiles_default_catch_mode_check
  check (default_catch_mode in ('AUTO_ACCEPT', 'MANUAL_APPROVAL')) not valid;

alter table public.profiles
  validate constraint profiles_default_catch_mode_check;

alter table public.profiles
  drop constraint if exists profiles_catch_mode_preference_source_check;

alter table public.profiles
  add constraint profiles_catch_mode_preference_source_check
  check (
    catch_mode_preference_source in (
      'system_default',
      'migrated_from_suits',
      'experiment_default',
      'user_selected'
    )
  ) not valid;

alter table public.profiles
  validate constraint profiles_catch_mode_preference_source_check;

with owned_suit_modes as (
  select
    owner_id,
    bool_or(catch_mode = 'MANUAL_APPROVAL') as has_manual_suit
  from public.fursuits
  where is_tutorial = false
  group by owner_id
)
update public.profiles p
set
  default_catch_mode = case
    when owned_suit_modes.has_manual_suit then 'MANUAL_APPROVAL'
    else 'AUTO_ACCEPT'
  end,
  catch_mode_preference_source = 'migrated_from_suits',
  updated_at = timezone('utc'::text, now())
from owned_suit_modes
where p.id = owned_suit_modes.owner_id
  and p.catch_mode_preference_source = 'system_default';

create table if not exists public.experiment_assignments (
  experiment_key text not null,
  subject_type text not null,
  subject_id uuid not null,
  variant text not null,
  assigned_at timestamptz not null default timezone('utc'::text, now()),
  first_exposed_at timestamptz,
  last_exposed_at timestamptz,
  exposure_count integer not null default 0,
  default_applied_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint experiment_assignments_pkey primary key (experiment_key, subject_type, subject_id),
  constraint experiment_assignments_subject_type_check check (subject_type in ('profile')),
  constraint experiment_assignments_variant_check check (variant in ('auto_default', 'manual_default')),
  constraint experiment_assignments_exposure_count_check check (exposure_count >= 0)
);

alter table public.experiment_assignments enable row level security;

create index if not exists experiment_assignments_subject_idx
  on public.experiment_assignments (subject_type, subject_id);

create index if not exists experiment_assignments_experiment_variant_idx
  on public.experiment_assignments (experiment_key, variant);

drop policy if exists "experiment_assignments_own_read" on public.experiment_assignments;
create policy "experiment_assignments_own_read"
  on public.experiment_assignments for select
  to authenticated
  using (subject_type = 'profile' and subject_id = auth.uid());

drop policy if exists "experiment_assignments_service_role_all" on public.experiment_assignments;
create policy "experiment_assignments_service_role_all"
  on public.experiment_assignments for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

insert into public.allowed_event_types (event_type, description, is_active)
values
  ('experiment_assigned', 'User was assigned to an experiment variant', true),
  ('experiment_exposed', 'User was exposed to an experiment-controlled surface', true),
  ('catch_mode_default_applied', 'Experiment default updated a profile catch mode preference', true),
  ('profile_catch_mode_changed', 'User changed their profile-level catch approval mode', true)
on conflict (event_type) do update
set
  description = excluded.description,
  is_active = true,
  deprecated_at = null;

create or replace function public.get_or_assign_catch_mode_default_experiment()
returns table (
  experiment_key text,
  variant text,
  profile_id uuid,
  previous_catch_mode text,
  current_catch_mode text,
  previous_preference_source text,
  current_preference_source text,
  assignment_created boolean,
  default_applied boolean,
  exposed_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_experiment_key constant text := 'catch_mode_default_v1';
  v_profile_id uuid := auth.uid();
  v_variant text;
  v_assignment_created boolean := false;
  v_now timestamptz := timezone('utc'::text, now());
  v_previous_catch_mode text;
  v_previous_source text;
  v_current_catch_mode text;
  v_current_source text;
  v_default_applied boolean := false;
begin
  if v_profile_id is null then
    raise exception 'Missing authenticated profile';
  end if;

  insert into public.profiles (id)
  values (v_profile_id)
  on conflict (id) do nothing;

  select
    p.default_catch_mode,
    p.catch_mode_preference_source
  into
    v_previous_catch_mode,
    v_previous_source
  from public.profiles p
  where p.id = v_profile_id
  for update;

  select ea.variant
  into v_variant
  from public.experiment_assignments ea
  where ea.experiment_key = v_experiment_key
    and ea.subject_type = 'profile'
    and ea.subject_id = v_profile_id
  for update;

  if v_variant is null then
    v_variant := case when random() < 0.5 then 'auto_default' else 'manual_default' end;
    v_assignment_created := true;

    insert into public.experiment_assignments (
      experiment_key,
      subject_type,
      subject_id,
      variant,
      assigned_at,
      metadata
    )
    values (
      v_experiment_key,
      'profile',
      v_profile_id,
      v_variant,
      v_now,
      jsonb_build_object('assignment_source', 'add_fursuit_entry')
    );
  end if;

  update public.experiment_assignments
  set
    first_exposed_at = coalesce(first_exposed_at, v_now),
    last_exposed_at = v_now,
    exposure_count = exposure_count + 1,
    updated_at = v_now
  where experiment_assignments.experiment_key = v_experiment_key
    and experiment_assignments.subject_type = 'profile'
    and experiment_assignments.subject_id = v_profile_id;

  if v_previous_source = 'system_default' then
    v_current_catch_mode := case
      when v_variant = 'manual_default' then 'MANUAL_APPROVAL'
      else 'AUTO_ACCEPT'
    end;
    v_current_source := 'experiment_default';
    v_default_applied := true;

    update public.profiles
    set
      default_catch_mode = v_current_catch_mode,
      catch_mode_preference_source = v_current_source,
      updated_at = v_now
    where id = v_profile_id;

    update public.experiment_assignments
    set
      default_applied_at = coalesce(default_applied_at, v_now),
      metadata = metadata || jsonb_build_object(
        'applied_catch_mode',
        v_current_catch_mode,
        'applied_source',
        'experiment_default'
      ),
      updated_at = v_now
    where experiment_assignments.experiment_key = v_experiment_key
      and experiment_assignments.subject_type = 'profile'
      and experiment_assignments.subject_id = v_profile_id;
  else
    v_current_catch_mode := v_previous_catch_mode;
    v_current_source := v_previous_source;
  end if;

  return query
  select
    v_experiment_key,
    v_variant,
    v_profile_id,
    v_previous_catch_mode,
    v_current_catch_mode,
    v_previous_source,
    v_current_source,
    v_assignment_created,
    v_default_applied,
    v_now;
end;
$$;

grant execute on function public.get_or_assign_catch_mode_default_experiment() to authenticated;

create or replace view public.catch_mode_default_experiment_results as
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
    case when ea.variant = 'manual_default' then 'MANUAL_APPROVAL' else 'AUTO_ACCEPT' end as variant_catch_mode
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
   and f.is_tutorial = false
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
  join public.fursuits f
    on f.owner_id = a.profile_id
   and f.is_tutorial = false
  join public.catches c
    on c.fursuit_id = f.id
   and a.first_exposed_at is not null
   and c.caught_at >= a.first_exposed_at
   and c.is_tutorial = false
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

grant select on public.catch_mode_default_experiment_results to authenticated, service_role;

create or replace function public.create_catch_with_approval(
  p_fursuit_id uuid,
  p_catcher_id uuid,
  p_convention_id uuid default null::uuid,
  p_is_tutorial boolean default false,
  p_force_pending boolean default false
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner_catch_mode text;
  v_fursuit_owner_id uuid;
  v_catch_status text;
  v_expires_at timestamptz;
  v_catch_id uuid;
  v_catch_number integer;
  v_result json;
begin
  select
    coalesce(p.default_catch_mode, 'AUTO_ACCEPT'),
    f.owner_id
  into
    v_owner_catch_mode,
    v_fursuit_owner_id
  from public.fursuits f
  left join public.profiles p on p.id = f.owner_id
  where f.id = p_fursuit_id;

  if not found then
    raise exception 'Fursuit not found';
  end if;

  if v_fursuit_owner_id = p_catcher_id then
    raise exception 'Cannot catch your own fursuit';
  end if;

  if p_convention_id is not null then
    if not public.is_convention_joinable(p_convention_id) then
      raise exception 'Convention is not live';
    end if;

    if not exists (
      select 1
        from public.profile_conventions pc
       where pc.profile_id = p_catcher_id
         and pc.convention_id = p_convention_id
    ) then
      raise exception 'Catcher must join the live convention before catching';
    end if;

    if not exists (
      select 1
        from public.fursuit_conventions fc
       where fc.fursuit_id = p_fursuit_id
         and fc.convention_id = p_convention_id
    ) then
      raise exception 'Fursuit must be assigned to the live convention before it can be caught there';
    end if;

    if exists (
      select 1
        from public.catches
       where fursuit_id = p_fursuit_id
         and catcher_id = p_catcher_id
         and convention_id = p_convention_id
         and status in ('ACCEPTED', 'PENDING')
    ) then
      raise exception 'Fursuit already caught at this convention';
    end if;
  else
    if exists (
      select 1
        from public.catches
       where fursuit_id = p_fursuit_id
         and catcher_id = p_catcher_id
         and convention_id is null
         and status in ('ACCEPTED', 'PENDING')
    ) then
      raise exception 'Fursuit already caught or pending';
    end if;
  end if;

  if (v_owner_catch_mode = 'MANUAL_APPROVAL' or p_force_pending) and not p_is_tutorial then
    v_catch_status := 'PENDING';
    if p_convention_id is not null then
      v_expires_at := public.calculate_catch_expiration(p_convention_id);
    else
      v_expires_at := public.calculate_catch_expiration();
    end if;
  else
    v_catch_status := 'ACCEPTED';
    v_expires_at := null;
  end if;

  insert into public.catches (
    fursuit_id,
    catcher_id,
    convention_id,
    is_tutorial,
    status,
    expires_at,
    caught_at
  )
  values (
    p_fursuit_id,
    p_catcher_id,
    p_convention_id,
    p_is_tutorial,
    v_catch_status,
    v_expires_at,
    now()
  )
  returning id, catch_number into v_catch_id, v_catch_number;

  select json_build_object(
    'catch_id', v_catch_id,
    'status', v_catch_status,
    'expires_at', v_expires_at,
    'catch_number', v_catch_number,
    'requires_approval', v_catch_status = 'PENDING',
    'fursuit_owner_id', v_fursuit_owner_id
  ) into v_result;

  return v_result;
end;
$$;
