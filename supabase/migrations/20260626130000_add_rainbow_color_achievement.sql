-- Add Rainbow as a normal selectable fursuit color and award future catches of Rainbow-tagged suits.

INSERT INTO public.fursuit_colors (id, name, is_active)
VALUES ('bb992390-da81-47de-a2c8-772305dcc52b', 'Rainbow', true)
ON CONFLICT (normalized_name) DO UPDATE
SET
  name = EXCLUDED.name,
  is_active = true;

INSERT INTO public.achievement_rules
  (rule_id, kind, slug, name, description, is_active, version, rule, metadata)
VALUES
  (
    '4e41b76e-d348-49f9-b729-43395b75e7cc',
    'permanent',
    'over_the_rainbow',
    'OVER_THE_RAINBOW',
    'Catch a fursuiter with Rainbow as one of their colors.',
    true,
    1,
    '{"event_type":"catch_performed"}'::jsonb,
    '{"can_run_client":true,"achievement_key":"OVER_THE_RAINBOW"}'::jsonb
  )
ON CONFLICT (rule_id) DO UPDATE
SET
  kind = EXCLUDED.kind,
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  version = EXCLUDED.version,
  rule = EXCLUDED.rule,
  metadata = EXCLUDED.metadata;

INSERT INTO public.achievements
  (
    id,
    key,
    name,
    description,
    category,
    recipient_role,
    trigger_event,
    is_active,
    rule_id,
    reset_mode,
    reset_timezone,
    reset_grace_minutes,
    convention_id
  )
VALUES
  (
    'd73dcb1e-01f3-4957-a798-f031e7e1d02e',
    'OVER_THE_RAINBOW',
    'Over the Rainbow',
    'Catch a fursuiter with Rainbow as one of their colors.',
    'variety',
    'catcher',
    'catch_performed',
    true,
    '4e41b76e-d348-49f9-b729-43395b75e7cc',
    'none',
    'UTC',
    0,
    null
  )
ON CONFLICT (id) DO UPDATE
SET
  key = EXCLUDED.key,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  recipient_role = EXCLUDED.recipient_role,
  trigger_event = EXCLUDED.trigger_event,
  is_active = EXCLUDED.is_active,
  rule_id = EXCLUDED.rule_id,
  reset_mode = EXCLUDED.reset_mode,
  reset_timezone = EXCLUDED.reset_timezone,
  reset_grace_minutes = EXCLUDED.reset_grace_minutes,
  convention_id = EXCLUDED.convention_id;
