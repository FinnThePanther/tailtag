import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const migrationsDir = join(root, 'supabase', 'migrations');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function latestMigration() {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  assert.ok(files.length > 0, 'expected at least one migration');

  const file = files.at(-1);

  return {
    file,
    source: read(join('supabase', 'migrations', file)),
  };
}

describe('fursuit edit profile RPC', () => {
  it('defines update_fursuit_profile in the latest migration', () => {
    const { file, source } = latestMigration();

    assert.match(file, /add_update_fursuit_profile_rpc\.sql$/);
    assert.match(source, /CREATE OR REPLACE FUNCTION public\.update_fursuit_profile\(/);
    assert.match(source, /RETURNS jsonb/);
    assert.match(source, /SECURITY DEFINER/);
    assert.match(source, /SET search_path TO public, pg_temp/);
  });

  it('returns typed code_taken conflicts before and during update races', () => {
    const { source } = latestMigration();

    assert.match(source, /'status', 'code_taken'/);
    assert.match(source, /WHERE upper\(f\.unique_code\) = v_normalized_code/);
    assert.match(source, /AND f\.id <> p_fursuit_id/);
    assert.match(source, /EXCEPTION\s+WHEN unique_violation THEN\s+RETURN jsonb_build_object\(/s);
    assert.match(source, /'unique_code', v_normalized_code/);
  });

  it('checks ownership before duplicate-code detection', () => {
    const { source } = latestMigration();
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
    const { source } = latestMigration();

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
});
