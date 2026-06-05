CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  generated_username text;
  legal_terms_accepted_at timestamptz := null;
  legal_terms_version integer := 0;
begin
  generated_username := public.generate_profile_username(
    new.raw_app_meta_data,
    new.raw_user_meta_data,
    new.email
  );

  begin
    if new.raw_user_meta_data ? 'legal_terms_accepted_at'
      and new.raw_user_meta_data ? 'legal_terms_version'
    then
      legal_terms_accepted_at := (new.raw_user_meta_data ->> 'legal_terms_accepted_at')::timestamptz;
      legal_terms_version := (new.raw_user_meta_data ->> 'legal_terms_version')::integer;
    end if;
  exception
    when others then
      legal_terms_accepted_at := null;
      legal_terms_version := 0;
  end;

  if legal_terms_accepted_at is not null and legal_terms_version > 0 then
    insert into public.profiles (
      id,
      username,
      legal_terms_accepted_at,
      legal_terms_version
    )
    values (
      new.id,
      generated_username,
      legal_terms_accepted_at,
      legal_terms_version
    )
    on conflict (id)
    do update set
      username = excluded.username,
      legal_terms_accepted_at = coalesce(
        public.profiles.legal_terms_accepted_at,
        excluded.legal_terms_accepted_at
      ),
      legal_terms_version = greatest(
        public.profiles.legal_terms_version,
        excluded.legal_terms_version
      );
  else
    insert into public.profiles (id, username)
    values (new.id, generated_username)
    on conflict (id)
    do update set
      username = excluded.username;
  end if;

  return new;
end;
$function$;
