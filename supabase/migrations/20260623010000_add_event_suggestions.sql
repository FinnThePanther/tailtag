create table public.event_suggestions (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_type text not null,
  event_visibility text not null,
  date_status text not null,
  start_date date null,
  end_date date null,
  date_notes text null,
  city_region text not null,
  country text not null,
  venue_name text null,
  official_url text null,
  submitter_relationship text not null,
  contact_method text not null,
  contact_value text not null,
  expected_attendance integer null,
  preferred_setup text null,
  notes text null,
  status text not null default 'new',
  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  resolution_reason text null,
  duplicate_of_convention_id uuid null references public.conventions(id) on delete set null,
  converted_convention_id uuid null references public.conventions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_suggestions_event_type_check check (
    event_type in ('convention', 'furmeet', 'public_meetup', 'private_event', 'other')
  ),
  constraint event_suggestions_event_visibility_check check (
    event_visibility in ('public', 'invite_only', 'private', 'not_sure')
  ),
  constraint event_suggestions_date_status_check check (
    date_status in ('known', 'approximate', 'not_announced')
  ),
  constraint event_suggestions_known_date_check check (
    date_status <> 'known' or start_date is not null
  ),
  constraint event_suggestions_end_after_start_check check (
    end_date is null or start_date is null or end_date >= start_date
  ),
  constraint event_suggestions_contact_method_check check (
    contact_method in ('email', 'telegram', 'discord', 'other')
  ),
  constraint event_suggestions_status_check check (
    status in ('new', 'reviewing', 'accepted', 'declined', 'duplicate', 'spam')
  ),
  constraint event_suggestions_expected_attendance_check check (
    expected_attendance is null or expected_attendance between 1 and 1000000
  ),
  constraint event_suggestions_event_name_length_check check (
    char_length(trim(event_name)) between 2 and 160
  ),
  constraint event_suggestions_city_region_length_check check (
    char_length(trim(city_region)) between 2 and 160
  ),
  constraint event_suggestions_country_length_check check (
    char_length(trim(country)) between 2 and 120
  ),
  constraint event_suggestions_submitter_relationship_length_check check (
    char_length(trim(submitter_relationship)) between 2 and 120
  ),
  constraint event_suggestions_contact_value_length_check check (
    char_length(trim(contact_value)) between 2 and 160
  ),
  constraint event_suggestions_date_notes_length_check check (
    date_notes is null or char_length(trim(date_notes)) <= 240
  ),
  constraint event_suggestions_venue_name_length_check check (
    venue_name is null or char_length(trim(venue_name)) <= 160
  ),
  constraint event_suggestions_official_url_length_check check (
    official_url is null or char_length(trim(official_url)) <= 500
  ),
  constraint event_suggestions_preferred_setup_length_check check (
    preferred_setup is null or char_length(trim(preferred_setup)) <= 120
  ),
  constraint event_suggestions_notes_length_check check (
    notes is null or char_length(trim(notes)) <= 1000
  ),
  constraint event_suggestions_resolution_reason_length_check check (
    resolution_reason is null or char_length(trim(resolution_reason)) <= 500
  ),
  constraint event_suggestions_official_url_format_check check (
    official_url is null or official_url ~* '^https?://'
  )
);

comment on table public.event_suggestions is
  'Public landing-page suggestions for events where TailTag could be playable. Suggestions require admin review before becoming conventions.';

create index event_suggestions_status_created_at_idx
  on public.event_suggestions (status, created_at desc);

create index event_suggestions_created_at_idx
  on public.event_suggestions (created_at desc);

create index event_suggestions_converted_convention_id_idx
  on public.event_suggestions (converted_convention_id)
  where converted_convention_id is not null;

create or replace function public.set_event_suggestions_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create trigger set_event_suggestions_updated_at
  before insert or update on public.event_suggestions
  for each row
  execute function public.set_event_suggestions_updated_at();

alter table public.event_suggestions enable row level security;

revoke all on public.event_suggestions from public, anon, authenticated;
grant insert on public.event_suggestions to anon;
grant select, insert, update, delete on public.event_suggestions to service_role;

create policy "Public can submit event suggestions"
  on public.event_suggestions
  for insert
  to anon
  with check (
    status = 'new'
    and reviewed_by is null
    and reviewed_at is null
    and resolution_reason is null
    and duplicate_of_convention_id is null
    and converted_convention_id is null
  );

create policy "Service role can manage event suggestions"
  on public.event_suggestions
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');
