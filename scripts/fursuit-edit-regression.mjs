import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const migrationsDir = join(root, 'supabase', 'migrations');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function fursuitProfileMigration() {
  const file = readdirSync(migrationsDir)
    .filter((candidate) => candidate.endsWith('_add_update_fursuit_profile_rpc.sql'))
    .sort();

  assert.ok(file.length > 0, 'expected update_fursuit_profile migration');

  return {
    file: file.at(-1),
    source: read(join('supabase', 'migrations', file.at(-1))),
  };
}

function codeChangeLimitMigration() {
  const files = readdirSync(migrationsDir)
    .filter(
      (candidate) =>
        candidate.endsWith('_limit_fursuit_code_changes.sql') ||
        candidate.endsWith('_lock_changed_fursuit_codes.sql'),
    )
    .sort();

  assert.ok(files.length > 0, 'expected fursuit code change limit migration');

  return {
    file: files.at(-1),
    source: files.map((file) => read(join('supabase', 'migrations', file))).join('\n'),
  };
}

function codeAuditMigration() {
  const file = readdirSync(migrationsDir)
    .filter((candidate) => candidate.endsWith('_harden_fursuit_code_audit_trail.sql'))
    .sort();

  assert.ok(file.length > 0, 'expected fursuit code audit migration');

  return {
    file: file.at(-1),
    source: read(join('supabase', 'migrations', file.at(-1))),
  };
}

function fursuitDisplayOrderMigration() {
  const file = readdirSync(migrationsDir)
    .filter((candidate) => candidate.endsWith('_add_fursuit_display_order.sql'))
    .sort();

  assert.ok(file.length > 0, 'expected fursuit display order migration');

  return {
    file: file.at(-1),
    source: read(join('supabase', 'migrations', file.at(-1))),
  };
}

describe('fursuit edit profile RPC', () => {
  it('defines update_fursuit_profile in its migration', () => {
    const { file, source } = fursuitProfileMigration();

    assert.match(file, /add_update_fursuit_profile_rpc\.sql$/);
    assert.match(source, /CREATE OR REPLACE FUNCTION public\.update_fursuit_profile\(/);
    assert.match(source, /RETURNS jsonb/);
    assert.match(source, /SECURITY DEFINER/);
    assert.match(source, /SET search_path TO public, pg_temp/);
  });

  it('returns typed code_taken conflicts before and during update races', () => {
    const { source } = fursuitProfileMigration();

    assert.match(source, /'status', 'code_taken'/);
    assert.match(
      source,
      /v_normalized_code text := upper\(btrim\(coalesce\(p_unique_code, ''\)\)\)/,
    );
    assert.match(source, /v_normalized_code !~ '\^\[A-Z0-9\]\{4,8\}\$'/);
    assert.match(source, /WHERE upper\(f\.unique_code\) = v_normalized_code/);
    assert.match(source, /AND f\.id <> p_fursuit_id/);
    assert.match(source, /EXCEPTION\s+WHEN unique_violation THEN\s+RETURN jsonb_build_object\(/s);
    assert.match(source, /'unique_code', v_normalized_code/);
  });

  it('checks ownership before duplicate-code detection', () => {
    const { source } = fursuitProfileMigration();
    const ownershipIndex = source.indexOf('AND f.owner_id = v_viewer_id');
    const duplicateIndex = source.indexOf('WHERE upper(f.unique_code) = v_normalized_code');

    assert.notEqual(ownershipIndex, -1, 'expected explicit owner check');
    assert.notEqual(duplicateIndex, -1, 'expected duplicate-code check');
    assert.ok(
      ownershipIndex < duplicateIndex,
      'ownership check must run before duplicate-code check',
    );
  });

  it('grants execute to authenticated clients', () => {
    const { source } = fursuitProfileMigration();

    assert.match(source, /GRANT EXECUTE ON FUNCTION public\.update_fursuit_profile\(/);
    assert.match(source, /TO authenticated, service_role;/);
  });

  it('routes the edit screen core save through updateFursuitProfile', () => {
    const source = read('app/fursuits/[id]/edit.tsx');
    const saveStart = source.indexOf('const updateResult = await updateFursuitProfile({');
    const rollbackStart = source.indexOf('if (updatedCoreRecord)', saveStart);
    const saveSection = source.slice(saveStart, rollbackStart);

    assert.notEqual(saveStart, -1, 'expected edit save to call updateFursuitProfile');
    assert.notEqual(rollbackStart, -1, 'expected rollback section after RPC call');
    assert.doesNotMatch(saveSection, /\.from\('fursuits'\)\s*\.update\(/);
    assert.match(saveSection, /updateResult\.status === 'code_taken'/);
    assert.match(saveSection, /updateResult\.status === 'code_invalid'/);
    assert.match(saveSection, /updateResult\.status === 'not_found'/);
  });

  it('sends client trace metadata with fursuit profile updates', () => {
    const source = read('src/features/suits/api/updateFursuitProfile.ts');

    assert.match(source, /createFursuitEditClientAttemptId/);
    assert.match(source, /crypto\.randomUUID/);
    assert.match(source, /p_client_attempt_id: clientAttemptId/);
    assert.match(source, /p_client_app_version: getClientAppVersion\(\)/);
    assert.match(source, /p_client_platform: Platform\.OS/);
    assert.match(source, /clientAttemptId,/);
  });

  it('enforces one catch code change through a server-side allowance ledger', () => {
    const { source } = codeChangeLimitMigration();

    assert.match(source, /CREATE TABLE IF NOT EXISTS public\.fursuit_code_change_allowances/);
    assert.match(source, /source IN \('existing_fursuit', 'fursuit_created', 'admin_grant'\)/);
    assert.match(source, /INSERT INTO public\.fursuit_code_change_allowances \(/);
    assert.match(source, /CREATE TRIGGER fursuits_grant_code_change_allowance/);
    assert.match(source, /CREATE TRIGGER fursuits_enforce_unique_code_change_limit/);
    assert.match(
      source,
      /DROP INDEX IF EXISTS public\.fursuit_code_change_allowances_one_use_per_suit_idx/,
    );
    assert.doesNotMatch(
      source,
      /CREATE UNIQUE INDEX IF NOT EXISTS fursuit_code_change_allowances_one_use_per_suit_idx/,
    );
    assert.match(source, /consumed_fursuit_id = OLD\.id/);
    assert.match(source, /RAISE EXCEPTION 'fursuit_code_change_locked'/);
    assert.match(
      source,
      /GRANT EXECUTE ON FUNCTION public\.grant_fursuit_code_change_allowance\(uuid, text\)\s+TO service_role;/,
    );
  });

  it('exposes catch code change status and returns locked code changes', () => {
    const { source } = codeChangeLimitMigration();

    assert.match(source, /CREATE OR REPLACE FUNCTION public\.get_fursuit_code_change_status/);
    assert.match(
      source,
      /'status',\s+CASE\s+WHEN v_has_changed_code OR v_remaining_changes <= 0 THEN 'locked'/s,
    );
    assert.match(
      source,
      /GRANT EXECUTE ON FUNCTION public\.get_fursuit_code_change_status\(uuid\)/,
    );
    assert.match(source, /'status', 'code_change_locked'/);
    assert.match(source, /WHEN raise_exception THEN\s+IF SQLERRM = 'fursuit_code_change_locked'/s);
  });

  it('locks a fursuit after its own catch code allowance is consumed', () => {
    const { source } = codeChangeLimitMigration();

    assert.match(source, /a\.consumed_fursuit_id = p_fursuit_id/);
    assert.match(source, /a\.consumed_fursuit_id = OLD\.id/);
    assert.match(
      source,
      /IF EXISTS \(\s+SELECT 1\s+FROM public\.fursuit_code_change_allowances a\s+WHERE a\.owner_id = v_viewer_id\s+AND a\.consumed_fursuit_id = p_fursuit_id\s+\) THEN\s+RETURN jsonb_build_object\(\s+'status', 'code_change_locked'/s,
    );
    assert.match(
      source,
      /IF EXISTS \(\s+SELECT 1\s+FROM public\.fursuit_code_change_allowances a\s+WHERE a\.owner_id = OLD\.owner_id\s+AND a\.consumed_fursuit_id = OLD\.id\s+\) THEN\s+RAISE EXCEPTION 'fursuit_code_change_locked'/s,
    );
  });

  it('renders locked catch codes as read-only in the edit screen', () => {
    const source = read('app/fursuits/[id]/edit.tsx');

    assert.match(
      source,
      /useQuery\(\{\s+enabled: Boolean\(fursuitId && userId && isOwner\),\s+queryKey: fursuitCodeChangeStatusQueryKey\(fursuitId \?\? '', userId\),\s+queryFn: async \(\) => \{\s+try \{\s+return await fetchFursuitCodeChangeStatus\(fursuitId \?\? ''\);/s,
    );
    assert.match(
      source,
      /const isCodeChangeLocked =\s+codeChangeStatus\?\.status === 'locked' \|\| codeChangeStatus\?\.hasChangedCode === true/,
    );
    assert.match(source, /!isCodeChangeStatusLoading/);
    assert.match(source, /codeChangeStatus\?\.status === 'available'/);
    assert.match(source, /editable=\{isCodeInputEditable\}/);
    assert.match(source, /Catch codes can be changed once\. This code is now set\./);
    assert.doesNotMatch(source, /unique_code: previousUniqueCode/);
  });

  it('adds fursuit timestamps and code audit tables', () => {
    const { source } = codeAuditMigration();

    assert.match(source, /ALTER TABLE public\.fursuits\s+ADD COLUMN IF NOT EXISTS updated_at/s);
    assert.match(source, /CREATE TRIGGER set_fursuits_updated_at/);
    assert.match(source, /CREATE TABLE IF NOT EXISTS public\.fursuit_unique_code_history/);
    assert.match(source, /CREATE TABLE IF NOT EXISTS public\.fursuit_code_change_attempts/);
    assert.match(
      source,
      /ALTER TABLE public\.fursuit_unique_code_history ENABLE ROW LEVEL SECURITY/,
    );
    assert.match(
      source,
      /ALTER TABLE public\.fursuit_code_change_attempts ENABLE ROW LEVEL SECURITY/,
    );
    assert.match(
      source,
      /REVOKE ALL ON TABLE public\.fursuit_unique_code_history FROM PUBLIC, anon, authenticated/,
    );
    assert.match(
      source,
      /REVOKE ALL ON TABLE public\.fursuit_code_change_attempts FROM PUBLIC, anon, authenticated/,
    );
  });

  it('keeps update_fursuit_profile unambiguous while accepting client trace defaults', () => {
    const { source } = codeAuditMigration();
    const legacySignature =
      /public\.update_fursuit_profile\(\s*uuid,\s*text,\s*uuid,\s*text,\s*text,\s*text,\s*text\[\],\s*text,\s*text,\s*text,\s*boolean\s*\)/;
    const tracedCreateSignature =
      /public\.update_fursuit_profile\(\s*p_fursuit_id uuid,\s*p_name text,\s*p_species_id uuid,\s*p_visibility_audience text,\s*p_owner_attribution_visibility text,\s*p_social_signal text,\s*p_interaction_badges text\[\],\s*p_unique_code text,\s*p_avatar_path text,\s*p_avatar_url text,\s*p_avatar_changed boolean,\s*p_client_attempt_id text DEFAULT NULL,\s*p_client_app_version text DEFAULT NULL,\s*p_client_platform text DEFAULT NULL\s*\)/;
    const tracedGrantSignature =
      /public\.update_fursuit_profile\(\s*uuid,\s*text,\s*uuid,\s*text,\s*text,\s*text,\s*text\[\],\s*text,\s*text,\s*text,\s*boolean,\s*text,\s*text,\s*text\s*\)/;

    assert.match(source, new RegExp(`DROP FUNCTION IF EXISTS ${legacySignature.source};`));
    assert.match(
      source,
      new RegExp(`CREATE OR REPLACE FUNCTION ${tracedCreateSignature.source}\\s*RETURNS jsonb`),
    );
    assert.match(
      source,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${tracedGrantSignature.source}\\s*TO authenticated, service_role;`,
      ),
    );
  });

  it('records code history and attempts for support investigations', () => {
    const { source } = codeAuditMigration();

    assert.match(source, /CREATE TRIGGER fursuits_log_unique_code_create/);
    assert.match(source, /CREATE TRIGGER fursuits_log_unique_code_update/);
    assert.match(source, /current_setting\('tailtag\.client_attempt_id', true\)/);
    assert.match(source, /CREATE OR REPLACE FUNCTION public\.record_fursuit_code_change_attempt/);
    assert.match(source, /'updated'/);
    assert.match(source, /'code_taken'/);
    assert.match(source, /'code_change_locked'/);
    assert.match(source, /'code_invalid'/);
    assert.match(source, /'not_found'/);
    assert.match(source, /p_conflicting_fursuit_id/);
    assert.match(source, /client_app_version,\s+client_platform,\s+metadata\s+\)\s+VALUES/s);
    assert.match(source, /NULLIF\(left\(btrim\(coalesce\(p_client_attempt_id, ''\)\), 128\), ''\)/);
    assert.match(source, /NULLIF\(left\(btrim\(coalesce\(p_client_app_version, ''\)\), 80\), ''\)/);
    assert.match(source, /NULLIF\(left\(btrim\(coalesce\(p_client_platform, ''\)\), 40\), ''\)/);
    assert.match(source, /current_setting\('tailtag\.client_attempt_id', true\)/);
    assert.match(source, /current_setting\('tailtag\.client_app_version', true\)/);
    assert.match(source, /current_setting\('tailtag\.client_platform', true\)/);
    assert.match(source, /v_supports_code_invalid_response/);
    assert.match(source, /jsonb_build_object\('source', 'update_fursuit_profile'/);
  });

  it('persists owned fursuit display order through guarded database primitives', () => {
    const { source } = fursuitDisplayOrderMigration();

    assert.match(source, /ALTER TABLE public\.fursuits\s+ADD COLUMN IF NOT EXISTS display_order/s);
    assert.match(source, /PARTITION BY owner_id\s+ORDER BY created_at DESC NULLS LAST, id DESC/s);
    assert.match(source, /CREATE TRIGGER set_new_fursuit_display_order/);
    assert.match(source, /coalesce\(min\(display_order\) - 1, 0\)/);
    assert.match(source, /CREATE OR REPLACE FUNCTION public\.reorder_own_fursuits/);
    assert.match(source, /v_viewer_id uuid := auth\.uid\(\)/);
    assert.match(source, /FOR UPDATE/);
    assert.match(source, /count\(DISTINCT requested\.fursuit_id\)/);
    assert.match(source, /Fursuit order must include every owned fursuit exactly once/);
    assert.match(
      source,
      /GRANT EXECUTE ON FUNCTION public\.reorder_own_fursuits\(uuid\[\]\) TO authenticated/,
    );
  });

  it('orders profile fursuit reads by saved display order', () => {
    const { source } = fursuitDisplayOrderMigration();

    assert.match(source, /display_order integer/);
    assert.match(source, /f\.display_order/);
    assert.match(
      source,
      /ORDER BY f\.display_order ASC NULLS LAST, f\.created_at DESC NULLS LAST, f\.id DESC/,
    );
  });

  it('routes mobile reordering through the saved order RPC', () => {
    const apiSource = read('src/features/suits/api/mySuits.ts');
    const reorderSource = read('app/(tabs)/suits/reorder.tsx');
    const indexSource = read('app/(tabs)/suits/index.tsx');

    assert.match(apiSource, /export async function reorderMySuits/);
    assert.match(apiSource, /\.rpc\('reorder_own_fursuits'/);
    assert.match(apiSource, /\.order\('display_order', \{ ascending: true, nullsFirst: false \}\)/);
    assert.match(reorderSource, /reorderMySuits\(nextOrder\.map\(\(suit\) => suit\.id\)\)/);
    assert.match(reorderSource, /ownerAttributionVisibility === 'hidden'/);
    assert.match(indexSource, /router\.push\('\/suits\/reorder'\)/);
  });
});
