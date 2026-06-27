import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptsDir, '..');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function readLatestMigrationMatching(pattern) {
  const migrationsDir = join(root, 'supabase/migrations');
  const migration = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .reverse()
    .find((file) => pattern.test(readFileSync(join(migrationsDir, file), 'utf8')));

  assert.ok(migration, `Expected to find migration matching ${pattern}`);

  return readFileSync(join(migrationsDir, migration), 'utf8');
}

async function importTypeScriptModule(path) {
  const source = read(path);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: false,
    },
    fileName: path,
  });

  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled.outputText, 'utf8').toString('base64')}`
  );
}

describe('Daily task optimistic progress', () => {
  it('normalizes canonical UUID strings', async () => {
    const { normalizeUuidString } = await importTypeScriptModule('src/utils/ids.ts');

    assert.equal(
      normalizeUuidString('  A0EBD36F-3BE9-4C7D-91A4-58E1543B2D2C  '),
      'a0ebd36f-3be9-4c7d-91a4-58e1543b2d2c',
    );
  });

  it('rejects missing sentinel and malformed UUID values', async () => {
    const { normalizeUuidString } = await importTypeScriptModule('src/utils/ids.ts');

    for (const value of [
      null,
      undefined,
      '',
      'null',
      'undefined',
      'abc',
      'a0ebd36f3be94c7d91a458e1543b2d2c',
      'a0ebd36f-3be9-4c7d-91a4-58e1543b2d2',
    ]) {
      assert.equal(normalizeUuidString(value), null);
    }
  });

  it('matches user-id filters against the active user', async () => {
    const { matchesDailyTaskMetadataFilters } = await importTypeScriptModule(
      'src/features/daily-tasks/optimisticProgress.ts',
    );
    const metadata = {
      eventType: 'catch_performed',
      metric: 'total',
      filters: [{ path: 'catcher_id', equalsUserId: true }],
    };

    assert.equal(
      matchesDailyTaskMetadataFilters(metadata, { catcher_id: 'user-1' }, 'user-1'),
      true,
    );
    assert.equal(
      matchesDailyTaskMetadataFilters(metadata, { catcher_id: 'user-2' }, 'user-1'),
      false,
    );
  });

  it('rejects notEqualsUserId filters for the active user', async () => {
    const { matchesDailyTaskMetadataFilters } = await importTypeScriptModule(
      'src/features/daily-tasks/optimisticProgress.ts',
    );
    const metadata = {
      eventType: 'catch_performed',
      metric: 'total',
      filters: [{ path: 'fursuit_owner_id', notEqualsUserId: true }],
    };

    assert.equal(
      matchesDailyTaskMetadataFilters(metadata, { fursuit_owner_id: 'user-2' }, 'user-1'),
      true,
    );
    assert.equal(
      matchesDailyTaskMetadataFilters(metadata, { fursuit_owner_id: 'user-1' }, 'user-1'),
      false,
    );
  });

  it('matches scalar and array candidates for in filters', async () => {
    const { matchesDailyTaskMetadataFilters } = await importTypeScriptModule(
      'src/features/daily-tasks/optimisticProgress.ts',
    );

    assert.equal(
      matchesDailyTaskMetadataFilters(
        {
          eventType: 'catch_performed',
          metric: 'total',
          filters: [{ path: 'species', in: ['fox', 'dragon'] }],
        },
        { species: 'fox' },
        'user-1',
      ),
      true,
    );
    assert.equal(
      matchesDailyTaskMetadataFilters(
        {
          eventType: 'catch_performed',
          metric: 'total',
          filters: [{ path: 'colors', in: ['red', 'blue'] }],
        },
        { colors: ['green', 'blue'] },
        'user-1',
      ),
      true,
    );
    assert.equal(
      matchesDailyTaskMetadataFilters(
        {
          eventType: 'catch_performed',
          metric: 'total',
          filters: [{ path: 'colors', in: ['red', 'blue'] }],
        },
        { colors: ['green', 'yellow'] },
        'user-1',
      ),
      false,
    );
  });

  it('rejects array candidates for notIn filters when any value is blocked', async () => {
    const { matchesDailyTaskMetadataFilters } = await importTypeScriptModule(
      'src/features/daily-tasks/optimisticProgress.ts',
    );
    const metadata = {
      eventType: 'catch_performed',
      metric: 'total',
      filters: [{ path: 'colors', notIn: ['red', 'blue'] }],
    };

    assert.equal(
      matchesDailyTaskMetadataFilters(metadata, { colors: ['green', 'yellow'] }, 'user-1'),
      true,
    );
    assert.equal(
      matchesDailyTaskMetadataFilters(metadata, { colors: ['green', 'blue'] }, 'user-1'),
      false,
    );
  });

  it('does not optimistic-update unique tasks', async () => {
    const { canOptimisticallyIncrementDailyTask } = await importTypeScriptModule(
      'src/features/daily-tasks/optimisticProgress.ts',
    );

    assert.equal(
      canOptimisticallyIncrementDailyTask({
        metadata: {
          eventType: 'catch_performed',
          metric: 'unique',
          uniqueBy: 'payload.fursuit_id',
          filters: [],
        },
        eventType: 'catch_performed',
        eventPayload: { status: 'ACCEPTED', fursuit_id: 'suit-1' },
        userId: 'user-1',
      }),
      false,
    );
  });

  it('only optimistic-updates catch tasks for accepted catch payloads', async () => {
    const { canOptimisticallyIncrementDailyTask } = await importTypeScriptModule(
      'src/features/daily-tasks/optimisticProgress.ts',
    );
    const metadata = {
      eventType: 'catch_performed',
      metric: 'total',
      filters: [{ path: 'catcher_id', equalsUserId: true }],
    };

    assert.equal(
      canOptimisticallyIncrementDailyTask({
        metadata,
        eventType: 'catch_performed',
        eventPayload: { status: 'PENDING', catcher_id: 'user-1' },
        userId: 'user-1',
      }),
      false,
    );
    assert.equal(
      canOptimisticallyIncrementDailyTask({
        metadata,
        eventType: 'catch_performed',
        eventPayload: { catcher_id: 'user-1' },
        userId: 'user-1',
      }),
      false,
    );
    assert.equal(
      canOptimisticallyIncrementDailyTask({
        metadata,
        eventType: 'catch_performed',
        eventPayload: { status: 'ACCEPTED', catcher_id: 'user-1' },
        userId: 'user-1',
      }),
      true,
    );
  });
});

describe('Daily task rotation metadata', () => {
  it('keeps rotation eligibility independent from active catalog availability', async () => {
    const { isDefaultRotationEligible, normalizeDailyTaskLevelingMetadata } =
      await importTypeScriptModule('supabase/functions/_shared/dailyTaskMetadata.ts');

    assert.equal(
      isDefaultRotationEligible({
        rotation: {
          eligible: true,
          slot: 'catch',
          difficulty: 'easy',
          family: 'catch_volume',
        },
      }),
      true,
    );
    assert.equal(
      isDefaultRotationEligible({
        rotation: {
          eligible: false,
          slot: 'catch',
          difficulty: 'hard',
          family: 'catch_volume',
        },
      }),
      false,
    );
    assert.equal(
      isDefaultRotationEligible({
        rotation: {
          eligible: true,
          slot: 'special',
          difficulty: 'special',
          family: 'maker_metadata',
        },
      }),
      false,
    );
    assert.equal(isDefaultRotationEligible({ defaultRotationEligible: false }), false);
    assert.deepEqual(normalizeDailyTaskLevelingMetadata({ leveling: { xp: 75 } }), { xp: 75 });
    assert.deepEqual(normalizeDailyTaskLevelingMetadata({ leveling: { xp: 0 } }), { xp: null });
  });

  it('ships catalog metadata and a data migration for V1 daily rotation', () => {
    const seed = read('supabase/seeds/reference.sql');
    const migration = readLatestMigrationMatching(/"family": "catch_volume"/);
    const legacyFlagMigration = readLatestMigrationMatching(/defaultRotationEligible/);
    const rotationFunction = read('supabase/functions/rotate-dailys/index.ts');
    const adminTaskCard = read('admin/components/convention-tasks-card.tsx');

    for (const source of [seed, migration]) {
      assert.match(source, /"slot":\s*"catch"/);
      assert.match(source, /"slot":\s*"explore"/);
      assert.match(source, /"slot":\s*"leaderboard"/);
      assert.match(source, /"difficulty":\s*"hard"/);
      assert.match(source, /"family":\s*"bio_views"/);
      assert.match(source, /"xp":\s*75/);
    }

    assert.match(seed, /Catch 10 suiters today[\s\S]*"eligible":false/);
    assert.match(seed, /Catch 10 suiters today[\s\S]*"defaultRotationEligible":false/);
    assert.match(seed, /Refresh the leaderboard twice[\s\S]*"eligible":false/);
    assert.match(
      legacyFlagMigration,
      /86765af1-77e8-4ca0-a3dc-51531dc9c6c2[\s\S]*c5914eb9-dbd2-41b0-8176-b98199e1eccf/,
    );
    assert.match(seed, /Same Studio[\s\S]*"slot":"special"[\s\S]*true, null, null\)/);
    assert.match(migration, /WHERE id = '8b5f9a7a-8d7d-4e89-9a92-4fd4b45b8b71';/);
    assert.match(rotationFunction, /function slotRecipe/);
    assert.match(rotationFunction, /return \['catch', 'explore', 'leaderboard'\]/);
    assert.match(
      rotationFunction,
      /selected\.filter\(\(entry\) => entry\.rotation\.slot === 'catch'\)\.length >= 2/,
    );
    assert.match(
      rotationFunction,
      /selected\.filter\(\(entry\) => entry\.rotation\.difficulty === 'hard'\)\.length >= 1/,
    );
    assert.match(adminTaskCard, /Default rotation eligible/);
    assert.match(adminTaskCard, /rotationSlot/);
    assert.match(adminTaskCard, /rotationDifficulty/);
    assert.match(adminTaskCard, /rotationFamily/);
    assert.match(adminTaskCard, /levelingXp/);
    assert.match(adminTaskCard, /function preservedFilters/);
  });
});
