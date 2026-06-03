alter table public.catches
  drop column if exists is_tutorial;

alter table public.fursuits
  drop column if exists is_tutorial;
