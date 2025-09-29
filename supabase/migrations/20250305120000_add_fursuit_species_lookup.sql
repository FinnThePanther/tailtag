-- Create lookup table for standardizing fursuit species
create table if not exists public.fursuit_species (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (
    lower(
      regexp_replace(
        btrim(name),
        '\s+',
        ' ',
        'g'
      )
    )
  ) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fursuit_species_name_length_check
    check (char_length(btrim(name)) between 2 and 120)
);

create unique index if not exists fursuit_species_normalized_name_unique
  on public.fursuit_species (normalized_name);

create index if not exists fursuit_species_created_at_idx
  on public.fursuit_species (created_at desc);

-- Ensure updated_at stays current on write operations
create or replace function public.set_fursuit_species_updated_at()
returns trigger as
$$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger set_fursuit_species_updated_at
  before update on public.fursuit_species
  for each row
  execute function public.set_fursuit_species_updated_at();

-- Attach species to fursuits
alter table if exists public.fursuits
  add column if not exists species_id uuid;

alter table if exists public.fursuits
  add constraint fursuits_species_id_fkey
  foreign key (species_id)
  references public.fursuit_species(id)
  on delete restrict;

create index if not exists fursuits_species_id_idx
  on public.fursuits (species_id);

-- Seed the lookup with common species entries
insert into public.fursuit_species (name)
values
  ('Wolf'),
  ('Fox'),
  ('Dragon'),
  ('Dutch Angel Dragon'),
  ('Sergal'),
  ('Husky'),
  ('Cat'),
  ('Dog'),
  ('Tiger'),
  ('Lion'),
  ('Rabbit'),
  ('Deer'),
  ('Otter'),
  ('Raccoon'),
  ('Shark'),
  ('Bird'),
  ('Bear'),
  ('Hyena'),
  ('Horse'),
  ('Cow'),
  ('Goat'),
  ('Bat'),
  ('Mouse'),
  ('Hybrid')
  on conflict (normalized_name)
  do nothing;
