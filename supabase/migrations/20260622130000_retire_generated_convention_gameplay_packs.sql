-- Stop using generated per-convention gameplay-pack copies.
-- Keep the rows for history, but prevent them from rotating or awarding going forward.

update public.daily_tasks
set
  is_active = false,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'retiredReason', 'generated_convention_pack_replaced_by_global_catalog',
    'retiredAtMigration', '20260622130000_retire_generated_convention_gameplay_packs'
  )
where convention_id is not null
  and metadata ->> 'defaultPackSource' in ('global_catalog', 'starter_pack');

update public.achievements a
set is_active = false
from public.achievement_rules ar
where a.rule_id = ar.rule_id
  and a.convention_id is not null
  and ar.metadata ->> 'defaultPackSource' in ('global_catalog', 'starter_pack');
