-- Remove the deprecated is_common flag from the species lookup.
alter table if exists public.fursuit_species
  drop column if exists is_common;

-- Reseed canonical species names to cover freshly created environments.
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
on conflict (normalized_name) do nothing;

-- Lock down access with restrictive row-level security policies.
alter table public.fursuit_species enable row level security;

create policy fursuit_species_read_access
  on public.fursuit_species
  for select
  using (true);

create policy fursuit_species_insert_authenticated
  on public.fursuit_species
  for insert
  with check (auth.uid() is not null);
