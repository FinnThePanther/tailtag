insert into public.edge_function_config (
  function_name,
  description,
  config
)
values (
  'gameplay_inline_processing_enabled',
  'Enable inline catch reward processing in create-catch',
  jsonb_build_object('value', true)
)
on conflict (function_name) do update
set
  description = excluded.description,
  config = jsonb_build_object('value', true),
  updated_at = now();
