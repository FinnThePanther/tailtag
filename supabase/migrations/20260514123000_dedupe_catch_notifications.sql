create unique index if not exists notifications_catch_once_idx
  on public.notifications (
    user_id,
    type,
    ((payload ->> 'catch_id'))
  )
  where payload ? 'catch_id';

create or replace function public.insert_catch_notification_once(
  p_user_id uuid,
  p_type text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_user_id is null then
    raise exception 'Missing notification user_id';
  end if;

  if p_type is null or char_length(btrim(p_type)) = 0 then
    raise exception 'Missing notification type';
  end if;

  if p_payload is null or not (p_payload ? 'catch_id') then
    raise exception 'Catch notification payload requires catch_id';
  end if;

  insert into public.notifications (
    user_id,
    type,
    payload
  )
  values (
    p_user_id,
    p_type,
    p_payload
  )
  on conflict (
    user_id,
    type,
    ((payload ->> 'catch_id'))
  )
  where payload ? 'catch_id'
  do nothing;
end;
$$;

revoke execute on function public.insert_catch_notification_once(uuid, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.insert_catch_notification_once(uuid, text, jsonb)
  to service_role;
