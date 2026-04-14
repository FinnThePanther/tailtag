-- =============================================================================
-- TailTag vault secret bootstrap
-- =============================================================================
-- Idempotent. Reads SUPABASE_URL and SERVICE_ROLE_KEY (which must already be
-- in the vault — they're seeded by scripts/setup-environment.sh) and derives
-- the rest of the application's vault secrets from them.
--
-- Why server-side SQL: this script never exposes secret values to the shell or
-- to logs. Values flow vault → vault entirely.
--
-- Apply with:
--   npx supabase db query --linked -f scripts/bootstrap-vault-secrets.sql
--
-- Safe to run repeatedly. The two random shared-secret values are only
-- generated on first run and preserved on subsequent runs to avoid surprise
-- rotations.
-- =============================================================================

DO $bootstrap$
DECLARE
  v_supabase_url text;
  v_service_key  text;
  v_existing_id  uuid;
BEGIN
  -- Required prerequisites
  SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets
   WHERE name = 'SUPABASE_URL'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    RAISE EXCEPTION 'SUPABASE_URL must be in vault before running this script (use scripts/setup-environment.sh first)';
  END IF;

  SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
   WHERE name = 'SERVICE_ROLE_KEY'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_service_key IS NULL OR v_service_key = '' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_KEY must be in vault before running this script (use scripts/setup-environment.sh first)';
  END IF;

  -- ── rotate_dailys_service_role_key ────────────────────────────────────────
  -- Used by app_private.rotate_daily_assignments_job() to authenticate to the
  -- rotate-dailys edge function. Always tracks SERVICE_ROLE_KEY.
  SELECT id INTO v_existing_id
    FROM vault.secrets WHERE name = 'rotate_dailys_service_role_key';
  IF v_existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_id, v_service_key);
  ELSE
    PERFORM vault.create_secret(
      v_service_key,
      'rotate_dailys_service_role_key',
      'Used by rotate-dailys cron to authenticate to its edge function'
    );
  END IF;

  -- ── send_push_service_role_jwt ────────────────────────────────────────────
  -- Reserved for legacy push pipeline. Kept in parity with dev so it's
  -- available if anything falls back to it.
  SELECT id INTO v_existing_id
    FROM vault.secrets WHERE name = 'send_push_service_role_jwt';
  IF v_existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_id, v_service_key);
  ELSE
    PERFORM vault.create_secret(
      v_service_key,
      'send_push_service_role_jwt',
      'Reserved for send-push edge function'
    );
  END IF;

  -- ── project_url ───────────────────────────────────────────────────────────
  -- Convenience copy of SUPABASE_URL kept in parity with dev.
  SELECT id INTO v_existing_id
    FROM vault.secrets WHERE name = 'project_url';
  IF v_existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_id, v_supabase_url);
  ELSE
    PERFORM vault.create_secret(
      v_supabase_url,
      'project_url',
      'Convenience copy of SUPABASE_URL'
    );
  END IF;

  -- ── ACHIEVEMENTS_PROCESSOR_URL ────────────────────────────────────────────
  -- Reserved for legacy achievement processor. Derived from SUPABASE_URL so
  -- it points to the right project.
  SELECT id INTO v_existing_id
    FROM vault.secrets WHERE name = 'ACHIEVEMENTS_PROCESSOR_URL';
  IF v_existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(
      v_existing_id,
      rtrim(v_supabase_url, '/') || '/functions/v1/process-achievements'
    );
  ELSE
    PERFORM vault.create_secret(
      rtrim(v_supabase_url, '/') || '/functions/v1/process-achievements',
      'ACHIEVEMENTS_PROCESSOR_URL',
      'Reserved for legacy achievement processor'
    );
  END IF;

  -- ── ACHIEVEMENTS_WEBHOOK_SECRET ───────────────────────────────────────────
  -- Random shared secret. Only generated on first run; preserved across
  -- subsequent runs so it never silently rotates.
  SELECT id INTO v_existing_id
    FROM vault.secrets WHERE name = 'ACHIEVEMENTS_WEBHOOK_SECRET';
  IF v_existing_id IS NULL THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ACHIEVEMENTS_WEBHOOK_SECRET',
      'Reserved shared secret; rotate manually if needed'
    );
  END IF;

  -- ── achievements_processor_secret ────────────────────────────────────────
  -- Random shared secret. Only generated on first run; preserved across
  -- subsequent runs so it never silently rotates.
  SELECT id INTO v_existing_id
    FROM vault.secrets WHERE name = 'achievements_processor_secret';
  IF v_existing_id IS NULL THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'achievements_processor_secret',
      'Reserved shared secret; rotate manually if needed'
    );
  END IF;
END;
$bootstrap$;
