-- Fix get_convention_suit_leaderboard: remove c.is_tutorial = false filter
-- (goes with earlier fix that didn't include this function)
drop function if exists public.get_convention_suit_leaderboard(uuid);
create or replace function public.get_convention_suit_leaderboard(p_convention_id uuid)
returns table(
  fursuit_id uuid,
  convention_id uuid,
  fursuit_name text,
  fursuit_avatar_url text,
  owner_id uuid,
  species_id uuid,
  species_name text,
  color_assignments jsonb,
  catch_count bigint,
  unique_catchers bigint,
  last_caught_at timestamp with time zone,
  first_caught_at timestamp with time zone,
  fursuit_redacted boolean
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with auth_context as (
    select auth.uid() as id
  ),
  leaderboard as (
    select
      c.fursuit_id,
      c.convention_id,
      count(*) as catch_count,
      count(distinct c.catcher_id) as unique_catchers,
      max(c.caught_at) as last_caught_at,
      min(c.caught_at) as first_caught_at
    from public.catches c
    cross join auth_context cu
    where cu.id is not null
      and c.status = 'ACCEPTED'
      and c.convention_id = p_convention_id
    group by c.fursuit_id, c.convention_id
  )
  select
    l.fursuit_id,
    l.convention_id,
    case when public.can_view_fursuit(cu.id, l.fursuit_id) then f.name else null end as fursuit_name,
    case when public.can_view_fursuit(cu.id, l.fursuit_id) then f.avatar_url else null end as fursuit_avatar_url,
    case when public.can_view_fursuit(cu.id, l.fursuit_id) then f.owner_id else null end as owner_id,
    case when public.can_view_fursuit(cu.id, l.fursuit_id) then fs.id else null end as species_id,
    case when public.can_view_fursuit(cu.id, l.fursuit_id) then fs.name else null end as species_name,
    case when public.can_view_fursuit(cu.id, l.fursuit_id) then colors.color_assignments else '[]'::jsonb end as color_assignments,
    l.catch_count,
    l.unique_catchers,
    l.last_caught_at,
    l.first_caught_at,
    not public.can_view_fursuit(cu.id, l.fursuit_id) as fursuit_redacted
  from leaderboard l
  join public.fursuits f on f.id = l.fursuit_id
  left join public.fursuit_species fs on fs.id = f.species_id
  cross join auth_context cu
  left join lateral (
    select coalesce(jsonb_agg(jsonb_build_object('position', fca.position, 'color', jsonb_build_object('id', fc.id, 'name', fc.name, 'normalized_name', fc.normalized_name)) order by fca.position asc, fc.name asc), '[]'::jsonb) as color_assignments
    from public.fursuit_color_assignments fca
    join public.fursuit_colors fc on fc.id = fca.color_id
    where fca.fursuit_id = f.id
  ) colors on true
  where not public.is_blocked(cu.id, f.owner_id)
  order by l.catch_count desc, fursuit_name asc nulls last, l.fursuit_id asc;
$$;

revoke all on function public.get_convention_suit_leaderboard(uuid) from public;
revoke all on function public.get_convention_suit_leaderboard(uuid) from anon;
grant execute on function public.get_convention_suit_leaderboard(uuid) to authenticated;

notify pgrst, 'reload schema';