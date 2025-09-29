-- Create fursuit bios table to store rich profile entries per suit
create table if not exists public.fursuit_bios (
  id uuid primary key default gen_random_uuid(),
  fursuit_id uuid not null,
  version integer not null,
  fursuit_name text not null,
  fursuit_species text not null,
  owner_name text not null,
  pronouns text not null,
  tagline text not null,
  fun_fact text not null,
  likes_and_interests text not null,
  ask_me_about text not null,
  social_links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fursuit_bios_fursuit_id_fkey
    foreign key (fursuit_id)
    references public.fursuits(id)
    on delete cascade,
  constraint fursuit_bios_version_check
    check (version > 0),
  constraint fursuit_bios_social_links_array_check
    check (jsonb_typeof(social_links) = 'array')
);

create unique index if not exists fursuit_bios_unique_fursuit_version
  on public.fursuit_bios (fursuit_id, version);

create index if not exists fursuit_bios_fursuit_id_idx
  on public.fursuit_bios (fursuit_id);

-- Keep updated_at fresh on each modification
create or replace function public.set_fursuit_bios_updated_at()
returns trigger as
$$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger set_fursuit_bios_updated_at
  before update on public.fursuit_bios
  for each row
  execute function public.set_fursuit_bios_updated_at();
