BEGIN;

ALTER TABLE public.notification_push_receipts
  ALTER COLUMN next_attempt_at DROP NOT NULL;

COMMIT;
