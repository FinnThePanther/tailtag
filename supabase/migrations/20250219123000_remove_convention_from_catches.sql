-- Rolls back convention scoping on catches.
-- Removes indexes/constraints introduced by 20250219120000_add_convention_to_catches.sql

-- Drop new indexes before altering columns.
drop index if exists public.catches_unique_catcher_fursuit_convention;
drop index if exists public.catches_convention_id_idx;

-- Drop foreign key and column if they still exist.
alter table public.catches
  drop constraint if exists catches_convention_id_fkey;

alter table public.catches
  drop column if exists convention_id;

-- Restore the original uniqueness constraint so each catcher can only
-- record one catch per suit across all conventions.
alter table public.catches
  add constraint catches_catcher_id_fursuit_id_key unique (catcher_id, fursuit_id);
