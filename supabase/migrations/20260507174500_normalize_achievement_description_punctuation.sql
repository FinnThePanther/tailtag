-- Normalize achievement description punctuation for consistent user-facing copy.

UPDATE public.achievements
SET description = trim(description) || '.'
WHERE description IS NOT NULL
  AND trim(description) <> ''
  AND trim(description) !~ '[.!?]$';

UPDATE public.achievement_rules
SET description = trim(description) || '.'
WHERE description IS NOT NULL
  AND trim(description) <> ''
  AND trim(description) !~ '[.!?]$';
