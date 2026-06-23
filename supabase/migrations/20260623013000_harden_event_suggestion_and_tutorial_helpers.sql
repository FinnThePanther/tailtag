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

drop trigger if exists set_event_suggestions_updated_at on public.event_suggestions;

create trigger set_event_suggestions_updated_at
  before insert or update on public.event_suggestions
  for each row
  execute function public.set_event_suggestions_updated_at();

revoke execute on function public.is_tutorial_fursuit(uuid) from public;
