-- TAILTAG-163: rollout control for player leveling UI visibility.

INSERT INTO public.feature_flags (key, description, enabled, rollout_percentage)
VALUES (
  'player_leveling_ui',
  'Show player level and XP progress in the mobile Settings screen.',
  false,
  0
)
ON CONFLICT (key) DO NOTHING;
