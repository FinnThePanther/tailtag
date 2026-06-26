import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const migrationsDir = join(root, 'supabase', 'migrations');
const migrationFile = '20260626110000_restore_fursuit_is_tutorial_compat.sql';
const migrationSource = readFileSync(join(migrationsDir, migrationFile), 'utf8');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function latestMatchingMigration(pattern) {
  const file = readdirSync(migrationsDir)
    .filter((candidate) => pattern.test(candidate))
    .sort()
    .at(-1);

  assert.ok(file, `expected migration matching ${pattern}`);
  return {
    file,
    source: read(join('supabase', 'migrations', file)),
  };
}

describe('tutorial fursuit compatibility', () => {
  it('restores only the fursuits REST compatibility column', () => {
    assert.match(
      migrationSource,
      /ALTER TABLE public\.fursuits\s+ADD COLUMN IF NOT EXISTS is_tutorial boolean NOT NULL DEFAULT false;/s,
    );
    assert.match(migrationSource, /COMMENT ON COLUMN public\.fursuits\.is_tutorial IS/);
    assert.match(migrationSource, /Legacy REST compatibility shadow column/);
    assert.doesNotMatch(
      migrationSource,
      /ALTER TABLE public\.catches\s+ADD COLUMN[^;]*is_tutorial/is,
    );
  });

  it('backfills from app_private.tutorial_fursuits', () => {
    assert.match(
      migrationSource,
      /UPDATE public\.fursuits f\s+SET is_tutorial = EXISTS \(\s+SELECT 1\s+FROM app_private\.tutorial_fursuits tf\s+WHERE tf\.fursuit_id = f\.id\s+\);/s,
    );
  });

  it('guards fursuit writes by deriving the shadow column from the private table', () => {
    assert.match(
      migrationSource,
      /CREATE OR REPLACE FUNCTION public\.sync_fursuit_is_tutorial_shadow\(\)/,
    );
    assert.match(migrationSource, /SECURITY DEFINER/);
    assert.match(migrationSource, /NEW\.is_tutorial := EXISTS \(/);
    assert.match(migrationSource, /FROM app_private\.tutorial_fursuits tf/);
    assert.match(
      migrationSource,
      /CREATE TRIGGER sync_fursuit_is_tutorial_shadow\s+BEFORE INSERT OR UPDATE ON public\.fursuits/s,
    );
  });

  it('keeps the shadow column current when private tutorial rows change', () => {
    assert.match(
      migrationSource,
      /CREATE OR REPLACE FUNCTION app_private\.sync_tutorial_fursuit_shadow\(\)/,
    );
    assert.match(migrationSource, /IF TG_OP = 'INSERT' THEN/);
    assert.match(migrationSource, /SET is_tutorial = true\s+WHERE id = NEW\.fursuit_id;/s);
    assert.match(migrationSource, /SET is_tutorial = false\s+WHERE id = OLD\.fursuit_id;/s);
    assert.match(
      migrationSource,
      /CREATE TRIGGER sync_tutorial_fursuit_shadow_insert\s+AFTER INSERT ON app_private\.tutorial_fursuits/s,
    );
    assert.match(
      migrationSource,
      /CREATE TRIGGER sync_tutorial_fursuit_shadow_delete\s+AFTER DELETE ON app_private\.tutorial_fursuits/s,
    );
  });

  it('reloads PostgREST without changing the canonical tutorial model', () => {
    assert.match(migrationSource, /NOTIFY pgrst, 'reload schema';/);
    assert.doesNotMatch(migrationSource, /DROP TABLE IF EXISTS app_private\.tutorial_fursuits/i);
    assert.doesNotMatch(migrationSource, /DROP FUNCTION public\.is_tutorial_fursuit/i);
  });

  it('does not reintroduce mobile queries or filters on is_tutorial', () => {
    for (const topLevelDir of ['app', 'src']) {
      const files = readdirSync(join(root, topLevelDir), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name))
        .filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));

      for (const file of files) {
        const source = readFileSync(file, 'utf8');

        assert.doesNotMatch(
          source,
          /\.select\([^)]*is_tutorial|\.eq\(['"]is_tutorial['"]|\.neq\(['"]is_tutorial['"]/s,
          `unexpected is_tutorial query or filter in ${file}`,
        );
      }
    }
  });

  it('keeps app_private.tutorial_fursuits as the canonical tutorial store', () => {
    const { source } = latestMatchingMigration(/move_tutorial_fursuits_private\.sql$/);

    assert.match(source, /create table if not exists app_private\.tutorial_fursuits/);
    assert.match(source, /create or replace function public\.is_tutorial_fursuit/);
    assert.match(source, /from app_private\.tutorial_fursuits/);
  });
});
