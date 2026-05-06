alter table public.fursuit_bios
  add column if not exists photo_credit text not null default '';
