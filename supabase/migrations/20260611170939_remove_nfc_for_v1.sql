BEGIN;

DELETE FROM public.tag_scans
WHERE scan_method = 'nfc';

DELETE FROM public.tags
WHERE qr_token IS NULL;

ALTER TABLE public.tag_scans
  DROP CONSTRAINT IF EXISTS tag_scans_scan_method_check;

ALTER TABLE public.tag_scans
  ADD CONSTRAINT tag_scans_scan_method_check
  CHECK (scan_method = 'qr') NOT VALID;

ALTER TABLE public.tag_scans
  VALIDATE CONSTRAINT tag_scans_scan_method_check;

ALTER TABLE public.tags
  DROP CONSTRAINT IF EXISTS tags_identifier_present;

ALTER TABLE public.tags
  ADD CONSTRAINT tags_identifier_present
  CHECK (qr_token IS NOT NULL) NOT VALID;

ALTER TABLE public.tags
  VALIDATE CONSTRAINT tags_identifier_present;

ALTER TABLE public.tags
  DROP CONSTRAINT IF EXISTS tags_nfc_uid_key;

DROP INDEX IF EXISTS public.tags_nfc_uid_key;

ALTER TABLE public.tags
  DROP COLUMN IF EXISTS nfc_uid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tags'::regclass
      AND conname = 'nfc_tags_fursuit_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tags'::regclass
      AND conname = 'tags_fursuit_id_fkey'
  ) THEN
    ALTER TABLE public.tags
      RENAME CONSTRAINT nfc_tags_fursuit_id_fkey TO tags_fursuit_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tags'::regclass
      AND conname = 'nfc_tags_pkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tags'::regclass
      AND conname = 'tags_pkey'
  ) THEN
    ALTER TABLE public.tags
      RENAME CONSTRAINT nfc_tags_pkey TO tags_pkey;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.nfc_tags_pkey') IS NOT NULL
    AND to_regclass('public.tags_pkey') IS NULL THEN
    ALTER INDEX public.nfc_tags_pkey RENAME TO tags_pkey;
  END IF;

  IF to_regclass('public.idx_nfc_tags_fursuit_id') IS NOT NULL
    AND to_regclass('public.idx_tags_fursuit_id') IS NULL THEN
    ALTER INDEX public.idx_nfc_tags_fursuit_id RENAME TO idx_tags_fursuit_id;
  END IF;

  IF to_regclass('public.idx_nfc_tags_one_active_per_fursuit') IS NOT NULL
    AND to_regclass('public.idx_tags_one_active_per_fursuit') IS NULL THEN
    ALTER INDEX public.idx_nfc_tags_one_active_per_fursuit RENAME TO idx_tags_one_active_per_fursuit;
  END IF;
END $$;

UPDATE public.edge_function_config
SET
  is_deprecated = true,
  deprecation_date = CURRENT_DATE,
  description = 'Deprecated tag endpoint disabled for V1',
  replacement_function = 'create-catch'
WHERE function_name IN ('lookup-tag', 'register-tag');

DELETE FROM public.allowed_event_types
WHERE event_type = 'nfc_scan';

COMMIT;
