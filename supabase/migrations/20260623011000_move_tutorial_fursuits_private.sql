create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to service_role;

create table if not exists app_private.tutorial_fursuits (
  fursuit_id uuid primary key references public.fursuits(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

alter table app_private.tutorial_fursuits enable row level security;
revoke all on app_private.tutorial_fursuits from public, anon, authenticated;
grant select, insert, delete on app_private.tutorial_fursuits to service_role;

do $$
begin
  if to_regclass('public.tutorial_fursuits') is not null then
    execute '
      insert into app_private.tutorial_fursuits (fursuit_id, created_at)
      select fursuit_id, created_at
      from public.tutorial_fursuits
      on conflict (fursuit_id) do update
      set created_at = least(app_private.tutorial_fursuits.created_at, excluded.created_at)
    ';
  end if;
end $$;

create or replace function public.is_tutorial_fursuit(p_fursuit_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'app_private', 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from app_private.tutorial_fursuits
    where tutorial_fursuits.fursuit_id = p_fursuit_id
  );
$$;

grant execute on function public.is_tutorial_fursuit(uuid) to authenticated, service_role;

drop table if exists public.tutorial_fursuits;
