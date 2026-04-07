create extension if not exists pgmq;

do $$
begin
  if not exists (
    select 1
    from pgmq.list_queues()
    where queue_name = 'gameplay_event_processing'
  ) then
    perform pgmq.create('gameplay_event_processing');
  end if;
end
$$;
