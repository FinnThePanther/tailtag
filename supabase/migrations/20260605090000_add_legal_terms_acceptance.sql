ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legal_terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_terms_version integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_legal_terms_version_nonnegative_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_legal_terms_version_nonnegative_check
  CHECK (legal_terms_version >= 0);
