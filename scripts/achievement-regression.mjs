import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptsDir, '..');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `expected ${name} to exist`);

  const bodyStart = source.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `expected ${name} to have a body`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart, index + 1);
      }
    }
  }

  throw new Error(`Could not locate body for ${name}`);
}

function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

describe('Checked In achievement hardening', () => {
  it('keeps mobile toast dedupe keyed by semantic Checked In surface', () => {
    const surfaceKeys = read('src/features/achievements/surfaceKeys.ts');
    const hook = read('src/features/achievements/hooks.ts');
    const manager = read('src/features/achievements/components/AchievementToastManager.tsx');

    assert.match(surfaceKeys, /CHECKED_IN_ACHIEVEMENT_SURFACE_KEY = 'achievement:checked-in'/);
    assert.match(surfaceKeys, /value === 'explorer'/);
    assert.match(surfaceKeys, /value === 'checked_in'/);
    assert.match(surfaceKeys, /triggerEvent === 'convention\.checkin'/);
    assert.match(surfaceKeys, /return CHECKED_IN_ACHIEVEMENT_SURFACE_KEY/);

    assert.match(hook, /getAchievementSurfaceKey\(achievement\)/);
    assert.match(hook, /seenUnlocksRef\.current\.has\(key\)/);
    assert.match(hook, /seenUnlocksRef\.current\.add\(key\)/);

    assert.match(manager, /surfacedAchievementSurfaceKeysRef/);
    assert.ok(
      countMatches(manager, /getAchievementAwardSurfaceKey\(/g) >= 4,
      'manager should dedupe status, immediate, realtime, and fallback paths by award surface key',
    );
    assert.match(manager, /fallbackSurfaceKey/);
  });

  it('keeps backend convention joins from awarding duplicate Checked In surfaces', () => {
    const source = read('supabase/functions/_shared/achievements.ts');
    const evaluateConventionAchievements = functionBody(source, 'evaluateConventionAchievements');
    const insertNotificationsForAwards = functionBody(source, 'insertNotificationsForAwards');

    assert.match(source, /function isCheckedInAchievementIdentity/);
    assert.match(source, /triggerEvent === 'convention\.checkin'/);

    assert.match(evaluateConventionAchievements, /sourceAchievementKey === 'EXPLORER'/);
    assert.match(evaluateConventionAchievements, /triggerEvent === 'convention_joined'/);
    assert.match(evaluateConventionAchievements, /if \(kind === 'convention_joined'\)/);
    assert.match(evaluateConventionAchievements, /continue;/);

    assert.match(
      insertNotificationsForAwards,
      /const surfacedNotificationKeys = new Set<string>\(\)/,
    );
    assert.match(insertNotificationsForAwards, /isCheckedInAchievementIdentity\(/);
    assert.match(insertNotificationsForAwards, /'achievement:checked-in'/);
    assert.match(
      insertNotificationsForAwards,
      /const userNotificationKey = `\$\{summary\.user_id}:/,
    );
    assert.match(
      insertNotificationsForAwards,
      /surfacedNotificationKeys\.has\(userNotificationKey\)/,
    );
  });

  it('prevents admin gameplay packs from creating convention-scoped Checked In achievements', () => {
    for (const path of [
      'admin/lib/convention-gameplay-pack.ts',
      'admin-v2/src/lib/server/convention-gameplay-pack.ts',
    ]) {
      const source = read(path);

      assert.doesNotMatch(source, /keySuffix:\s*'CHECKED_IN'/, `${path} must not seed Checked In`);
      assert.match(
        source,
        /isCheckedInAchievementIdentity/,
        `${path} must identify catalog clones`,
      );
      assert.match(source, /triggerEvent:\s*catalogAchievement\.trigger_event/);
      assert.match(source, /continue;/, `${path} must skip Checked In catalog clones`);
    }
  });

  it('blocks Checked In-style convention achievements in both admin write surfaces', () => {
    for (const path of [
      'admin/app/(dashboard)/conventions/actions.ts',
      'admin-v2/src/lib/server/actions/conventions.ts',
    ]) {
      const source = read(path);

      assert.match(source, /assertNotCheckedInConventionAchievement/);
      assert.ok(
        countMatches(source, /assertNotCheckedInConventionAchievement\(/g) >= 3,
        `${path} must guard create, reactivate, and active update paths`,
      );
      assert.match(source, /\.select\('key, name, trigger_event'\)/);
      assert.match(source, /\.select\('key, is_active'\)/);
    }
  });

  it('has a database backstop for active convention-scoped Checked In identities', () => {
    const migration = read(
      'supabase/migrations/20260518120000_enforce_global_checked_in_achievement.sql',
    );

    assert.match(
      migration,
      /CREATE OR REPLACE FUNCTION app_private\.is_checked_in_achievement_identity/,
    );
    assert.match(migration, /p_trigger_event = 'convention\.checkin'/);
    assert.match(migration, /NEW\.convention_id IS NOT NULL/);
    assert.match(migration, /NEW\.is_active = true/);
    assert.match(
      migration,
      /BEFORE INSERT OR UPDATE OF key, name, trigger_event, convention_id, is_active/,
    );
    assert.match(migration, /EXECUTE FUNCTION app_private\.enforce_global_checked_in_achievement/);
    assert.match(migration, /UPDATE public\.achievements\s+SET is_active = false/);
  });
});
