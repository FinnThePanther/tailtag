-- Enforce strict username rules with manual cleanup gate.
--
-- Rules when username is present:
-- - 3-15 characters
-- - lowercase a-z, digits 0-9, underscore only
-- - must not include "tailtag" or "admin"
-- - globally unique case-insensitively

-- ---------------------------------------------------------------------------
-- Preflight gate: require manual cleanup before schema constraints are applied.
-- ---------------------------------------------------------------------------
do $$
declare
  v_invalid_count integer := 0;
  v_reserved_count integer := 0;
  v_collision_count integer := 0;
begin
  select count(*)
  into v_invalid_count
  from public.profiles
  where username is not null
    and username !~ '^[a-z0-9_]{3,15}$';

  select count(*)
  into v_reserved_count
  from public.profiles
  where username is not null
    and (
      position('tailtag' in lower(username)) > 0
      or position('admin' in lower(username)) > 0
    );

  select count(*)
  into v_collision_count
  from (
    select lower(username)
    from public.profiles
    where username is not null
    group by lower(username)
    having count(*) > 1
  ) collisions;

  if v_invalid_count > 0 or v_reserved_count > 0 or v_collision_count > 0 then
    raise exception 'Username migration blocked: manual cleanup required'
      using detail = format(
        'invalid_format=%s reserved_terms=%s case_collisions=%s',
        v_invalid_count,
        v_reserved_count,
        v_collision_count
      ),
      hint = 'Fix offending usernames first, then rerun this migration.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enforce new constraints + case-insensitive uniqueness.
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_username_key,
  drop constraint if exists profiles_username_format_check,
  drop constraint if exists profiles_username_reserved_tailtag_check,
  drop constraint if exists profiles_username_reserved_admin_check;

drop index if exists public.profiles_username_key;
drop index if exists public.profiles_username_lower_key;

alter table public.profiles
  add constraint profiles_username_format_check
    check (username is null or username ~ '^[a-z0-9_]{3,15}$'),
  add constraint profiles_username_reserved_tailtag_check
    check (username is null or position('tailtag' in lower(username)) = 0),
  add constraint profiles_username_reserved_admin_check
    check (username is null or position('admin' in lower(username)) = 0);

create unique index if not exists profiles_username_lower_key
  on public.profiles using btree (lower(username))
  where username is not null;

-- ---------------------------------------------------------------------------
-- Username availability RPC (RLS-safe).
-- ---------------------------------------------------------------------------
create or replace function public.is_username_available(
  p_username text,
  p_current_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_candidate text;
begin
  v_candidate := lower(trim(coalesce(p_username, '')));

  if v_candidate = '' then
    return false;
  end if;

  if v_candidate !~ '^[a-z0-9_]{3,15}$' then
    return false;
  end if;

  if position('tailtag' in v_candidate) > 0 or position('admin' in v_candidate) > 0 then
    return false;
  end if;

  return not exists (
    select 1
    from public.profiles p
    where p.username is not null
      and lower(p.username) = v_candidate
      and (p_current_user_id is null or p.id <> p_current_user_id)
  );
end;
$function$;

revoke all on function public.is_username_available(text, uuid) from public;
grant execute on function public.is_username_available(text, uuid) to authenticated;
grant execute on function public.is_username_available(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Keep generated usernames compliant with the same rules.
-- ---------------------------------------------------------------------------
create or replace function public.generate_profile_username(app_meta jsonb, user_meta jsonb, user_email text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  provider text := coalesce(app_meta->>'provider', 'email');
  base_username text;
  sanitized_username text;
  final_username text;
  suffix text;
  max_prefix_length integer := 10; -- 15 - 1 - 4
begin
  if provider = 'discord' then
    base_username := nullif(
      trim(
        both from coalesce(
          user_meta->>'username',
          user_meta->>'user_name',
          user_meta->>'preferred_username',
          user_meta->>'full_name',
          user_meta->>'name'
        )
      ),
      ''
    );
  else
    base_username := nullif(trim(both from user_meta->>'username'), '');
  end if;

  if base_username is null then
    base_username := split_part(coalesce(user_email, ''), '@', 1);
  end if;

  if base_username is null or base_username = '' then
    base_username := 'player';
  end if;

  sanitized_username := lower(regexp_replace(base_username, '[^a-z0-9_]+', '', 'g'));
  sanitized_username := replace(sanitized_username, 'tailtag', '');
  sanitized_username := replace(sanitized_username, 'admin', '');
  sanitized_username := trim(both '_' from sanitized_username);

  if sanitized_username = '' then
    sanitized_username := 'player';
  end if;

  sanitized_username := substring(sanitized_username from 1 for 15);

  if length(sanitized_username) < 3 then
    sanitized_username := 'player';
  end if;

  final_username := sanitized_username;

  if final_username ~ '^[a-z0-9_]{3,15}$'
     and position('tailtag' in final_username) = 0
     and position('admin' in final_username) = 0
     and not exists (
       select 1
       from public.profiles p
       where p.username is not null
         and lower(p.username) = final_username
     ) then
    return final_username;
  end if;

  loop
    suffix := substring(md5(gen_random_uuid()::text) for 4);
    final_username := left(sanitized_username, max_prefix_length) || '_' || suffix;

    exit when final_username ~ '^[a-z0-9_]{3,15}$'
      and position('tailtag' in final_username) = 0
      and position('admin' in final_username) = 0
      and not exists (
        select 1
        from public.profiles p
        where p.username is not null
          and lower(p.username) = final_username
      );
  end loop;

  return final_username;
end;
$function$;
