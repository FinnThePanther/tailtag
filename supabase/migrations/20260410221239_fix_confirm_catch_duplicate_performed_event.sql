-- Prevent duplicate catch_performed ingestion on catch confirmation.
-- confirm_catch should emit catch_confirmed only; catch_performed is synthesized
-- by the achievement processor when needed.

create or replace function public.confirm_catch(
  p_catch_id uuid,
  p_decision text,
  p_user_id uuid,
  p_reason text default null::text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_catch record;
  v_new_status text;
  v_result json;
  v_decided_at timestamptz := now();
begin
  if p_decision not in ('accept', 'reject') then
    raise exception 'Invalid decision. Must be accept or reject';
  end if;

  select
    c.*,
    f.owner_id,
    f.name as fursuit_name,
    f.is_tutorial as fursuit_is_tutorial,
    fs.name as species_name,
    coalesce((
      select jsonb_agg(fc.name order by fca.position)
      from public.fursuit_color_assignments fca
      join public.fursuit_colors fc on fc.id = fca.color_id
      where fca.fursuit_id = c.fursuit_id
    ), '[]'::jsonb) as color_names,
    p.username as catcher_username
  into v_catch
  from public.catches c
  join public.fursuits f on c.fursuit_id = f.id
  join public.profiles p on c.catcher_id = p.id
  left join public.fursuit_species fs on fs.id = f.species_id
  where c.id = p_catch_id
    and c.status = 'PENDING'
    and c.expires_at > now()
  for update of c;

  if not found then
    raise exception 'Catch not found or already decided';
  end if;

  if v_catch.owner_id != p_user_id then
    raise exception 'You do not own this fursuit';
  end if;

  v_new_status := case
    when p_decision = 'accept' then 'ACCEPTED'
    else 'REJECTED'
  end;

  update public.catches
  set
    status = v_new_status,
    decided_at = v_decided_at,
    decided_by_user_id = p_user_id,
    rejection_reason = case when p_decision = 'reject' then p_reason else null end
  where id = p_catch_id;

  perform public.notify_catch_decision(
    p_catch_id,
    v_catch.catcher_id,
    v_catch.fursuit_id,
    v_catch.fursuit_name,
    p_decision,
    p_reason
  );

  if p_decision = 'accept' then
    perform app_private.ingest_gameplay_event(
      'catch_confirmed',
      v_catch.catcher_id,
      v_catch.convention_id,
      jsonb_build_object(
        'catch_id', p_catch_id,
        'decision', p_decision
      ),
      v_decided_at,
      format('catch:%s:confirmed', p_catch_id)
    );

    begin
      perform public.process_gameplay_queue_if_active();
    exception
      when others then
        raise warning 'confirm_catch failed to wake gameplay queue for catch %: %', p_catch_id, sqlerrm;
    end;
  end if;

  select json_build_object(
    'success', true,
    'catch_id', p_catch_id,
    'decision', p_decision,
    'status', v_new_status,
    'fursuit_name', v_catch.fursuit_name,
    'catcher_id', v_catch.catcher_id,
    'fursuit_id', v_catch.fursuit_id,
    'convention_id', v_catch.convention_id
  ) into v_result;

  return v_result;
end;
$function$;
