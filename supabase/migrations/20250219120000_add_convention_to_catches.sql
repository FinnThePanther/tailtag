-- Adds convention scoping to catches so suits can be caught once per con per player
alter table public.catches
  add column if not exists convention_id uuid;

alter table public.catches
  add constraint catches_convention_id_fkey
  foreign key (convention_id)
  references public.conventions(id)
  on delete set null;

-- Relax the old unique constraint so the same suit can be logged across different conventions
alter table public.catches
  drop constraint if exists catches_catcher_id_fursuit_id_key;

create unique index if not exists catches_unique_catcher_fursuit_convention
  on public.catches (catcher_id, fursuit_id, convention_id)
  where convention_id is not null;

create index if not exists catches_convention_id_idx
  on public.catches (convention_id);
