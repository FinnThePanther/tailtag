create or replace function public.replace_fursuit_makers(
  fursuit_id uuid,
  makers jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_fursuit_id uuid := $1;
  v_makers jsonb := coalesce($2, '[]'::jsonb);
  v_maker jsonb;
  v_position integer;
  v_maker_name text;
  v_normalized_maker_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.fursuits
    where id = v_fursuit_id
      and owner_id = auth.uid()
  ) then
    raise exception 'Fursuit not found or not owned by current user'
      using errcode = '42501';
  end if;

  if jsonb_typeof(v_makers) <> 'array' then
    raise exception 'makers must be an array'
      using errcode = '22023';
  end if;

  if jsonb_array_length(v_makers) > 10 then
    raise exception 'A fursuit can have at most 10 makers'
      using errcode = '22023';
  end if;

  delete from public.fursuit_makers
  where fursuit_makers.fursuit_id = v_fursuit_id;

  for v_maker, v_position in
    select value, ordinality::integer
    from jsonb_array_elements(v_makers) with ordinality
  loop
    v_maker_name := btrim(v_maker ->> 'maker_name');
    v_normalized_maker_name := btrim(v_maker ->> 'normalized_maker_name');

    if coalesce(v_maker_name, '') = '' or coalesce(v_normalized_maker_name, '') = '' then
      raise exception 'maker_name and normalized_maker_name are required'
        using errcode = '22023';
    end if;

    insert into public.fursuit_makers (
      fursuit_id,
      maker_name,
      normalized_maker_name,
      position
    )
    values (
      v_fursuit_id,
      v_maker_name,
      v_normalized_maker_name,
      v_position
    );
  end loop;
end;
$function$;

grant execute on function public.replace_fursuit_makers(uuid, jsonb) to authenticated;
