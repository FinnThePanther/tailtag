begin;

alter table public.fursuit_bios enable row level security;

create policy "fursuit_bios_select_all_authenticated"
  on public.fursuit_bios
  for select
  to authenticated
  using (true);

create policy "fursuit_bios_insert_owner"
  on public.fursuit_bios
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.fursuits f
      where f.id = fursuit_bios.fursuit_id
        and f.owner_id = auth.uid()
    )
  );

create policy "fursuit_bios_update_owner"
  on public.fursuit_bios
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.fursuits f
      where f.id = fursuit_bios.fursuit_id
        and f.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.fursuits f
      where f.id = fursuit_bios.fursuit_id
        and f.owner_id = auth.uid()
    )
  );

commit;
