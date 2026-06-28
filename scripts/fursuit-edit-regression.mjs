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
    assert.match(saveSection, /updateResult\.status === 'not_found'/);
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
});
