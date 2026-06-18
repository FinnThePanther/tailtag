import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptsDir, '..');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
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
