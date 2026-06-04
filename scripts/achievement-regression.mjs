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
  const unresolvedImport = transpiled.outputText
    .split('\n')
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length > 0 &&
        (line.startsWith('import ') ||
          /^export\s+.*\s+from\s+['"]/.test(line) ||
          /import\s*\(/.test(line)),
    );

  if (unresolvedImport) {
    throw new Error(
      `importTypeScriptModule cannot load ${path} because transpiled.outputText still contains a runtime import: ${unresolvedImport}`,
    );
  }

  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled.outputText, 'utf8').toString('base64')}`
  );
}

function checkedInAchievement(overrides = {}) {
  return {
    id: 'global-explorer',
    key: 'EXPLORER',
    name: 'Explorer',
    description: 'Check in to a convention.',
    category: 'meta',
    recipientRole: 'any',
    triggerEvent: 'convention.checkin',
    unlocked: true,
    unlockedAt: '2026-05-18T12:00:00.000Z',
    context: null,
    ...overrides,
  };
}

function visibleAchievementToasts(getAchievementSurfaceKey, achievements, initiallySeen = []) {
  const seen = new Set(initiallySeen);
  const toasts = [];

  for (const achievement of achievements) {
    const surfaceKey = getAchievementSurfaceKey(achievement);
    if (seen.has(surfaceKey)) continue;

    seen.add(surfaceKey);
    toasts.push(achievement.name);
  }

  return toasts;
}

function visibleAwardSurfaces(getAchievementAwardSurfaceKey, awards, initiallySeen = []) {
  const seen = new Set(initiallySeen);
  const visible = [];

  for (const award of awards) {
    const surfaceKey = getAchievementAwardSurfaceKey(award);
    if (!surfaceKey || seen.has(surfaceKey)) continue;

    seen.add(surfaceKey);
    visible.push(surfaceKey);
  }

  return visible;
}

describe('Checked In achievement hardening', () => {
  it('maps every Checked In identity to one semantic achievement surface', async () => {
    const {
      CHECKED_IN_ACHIEVEMENT_SURFACE_KEY,
      getAchievementAwardSurfaceKey,
      getAchievementSurfaceKey,
    } = await importTypeScriptModule('src/features/achievements/surfaceKeys.ts');

    const checkedInRows = [
      checkedInAchievement(),
      checkedInAchievement({
        id: 'convention-alpha-checked-in',
        key: 'CONVENTION_ALPHA_CHECKED_IN',
        name: 'Checked In',
        triggerEvent: 'convention_joined',
      }),
      checkedInAchievement({
        id: 'convention-beta-checkin',
        key: 'convention_beta_checkin',
        name: 'Beta Checkin',
        triggerEvent: 'convention_joined',
      }),
      checkedInAchievement({
        id: 'legacy-check-in',
        key: 'legacy_check_in',
        name: 'Check In',
        triggerEvent: 'convention_joined',
      }),
    ];

    assert.equal(CHECKED_IN_ACHIEVEMENT_SURFACE_KEY, 'achievement:checked-in');
    assert.deepEqual(
      checkedInRows.map((achievement) => getAchievementSurfaceKey(achievement)),
      checkedInRows.map(() => CHECKED_IN_ACHIEVEMENT_SURFACE_KEY),
    );
    assert.equal(
      getAchievementAwardSurfaceKey({
        achievementId: 'notification-a',
        achievementKey: 'CONVENTION_GAMMA_CHECKED_IN',
        achievementName: 'Checked In',
      }),
      CHECKED_IN_ACHIEVEMENT_SURFACE_KEY,
    );
    assert.equal(
      getAchievementSurfaceKey(
        checkedInAchievement({
          id: 'first-catch',
          key: 'FIRST_CATCH',
          name: 'First Catch',
          triggerEvent: 'catch_performed',
        }),
      ),
      'achievement:first-catch',
    );
  });

  it('shows one Checked In toast for multi-convention onboarding scenarios', async () => {
    const { CHECKED_IN_ACHIEVEMENT_SURFACE_KEY, getAchievementSurfaceKey } =
      await importTypeScriptModule('src/features/achievements/surfaceKeys.ts');

    const scenarios = [
      {
        name: 'current/current',
        awards: [
          checkedInAchievement({ id: 'current-a', key: 'EXPLORER', name: 'Explorer' }),
          checkedInAchievement({
            id: 'current-b',
            key: 'CONVENTION_B_CHECKED_IN',
            name: 'Checked In',
            triggerEvent: 'convention_joined',
          }),
        ],
      },
      {
        name: 'future/future',
        awards: [
          checkedInAchievement({
            id: 'future-a',
            key: 'FUTURE_A_CHECKIN',
            name: 'Future A Checkin',
            triggerEvent: 'convention_joined',
          }),
          checkedInAchievement({
            id: 'future-b',
            key: 'FUTURE_B_CHECKED_IN',
            name: 'Checked In',
            triggerEvent: 'convention_joined',
          }),
        ],
      },
      {
        name: 'current/future',
        awards: [
          checkedInAchievement({ id: 'current', key: 'EXPLORER', name: 'Explorer' }),
          checkedInAchievement({
            id: 'future',
            key: 'FUTURE_CHECK_IN',
            name: 'Check In',
            triggerEvent: 'convention_joined',
          }),
        ],
      },
    ];

    for (const scenario of scenarios) {
      assert.equal(
        visibleAchievementToasts(getAchievementSurfaceKey, scenario.awards).length,
        1,
        `${scenario.name} should show exactly one Checked In toast`,
      );
    }

    assert.deepEqual(
      visibleAchievementToasts(
        getAchievementSurfaceKey,
        [
          checkedInAchievement({
            id: 'later-convention',
            key: 'LATER_CHECKED_IN',
            name: 'Checked In',
            triggerEvent: 'convention_joined',
          }),
        ],
        [CHECKED_IN_ACHIEVEMENT_SURFACE_KEY],
      ),
      [],
      'joining another convention after Explorer is already surfaced should not toast again',
    );
  });

  it('suppresses realtime, catch-up, and fallback Checked In replays after any first surface', async () => {
    const { getAchievementAwardSurfaceKey } = await importTypeScriptModule(
      'src/features/achievements/surfaceKeys.ts',
    );

    assert.deepEqual(
      visibleAwardSurfaces(getAchievementAwardSurfaceKey, [
        {
          achievementId: 'optimistic-explorer',
          achievementKey: 'EXPLORER',
          achievementName: 'Explorer',
          triggerEvent: 'convention.checkin',
        },
        {
          achievementId: 'realtime-convention-row',
          achievementKey: 'CONVENTION_ALPHA_CHECKED_IN',
          achievementName: 'Checked In',
        },
        {
          achievementId: 'catchup-convention-row',
          achievementKey: 'CONVENTION_BETA_CHECKIN',
          achievementName: 'Beta Checkin',
        },
        {
          achievementId: null,
          achievementKey: null,
          achievementName: 'Checked In',
        },
      ]),
      ['achievement:checked-in'],
    );
  });

  it('dedupes Checked In notification surfaces within one award batch', async () => {
    const { getAchievementAwardSurfaceKey } = await importTypeScriptModule(
      'src/features/achievements/surfaceKeys.ts',
    );

    const awardedSummaries = [
      {
        userId: 'user-a',
        achievementId: 'global-explorer',
        achievementKey: 'EXPLORER',
        achievementName: 'Explorer',
        triggerEvent: 'convention.checkin',
      },
      {
        userId: 'user-a',
        achievementId: 'convention-alpha',
        achievementKey: 'CONVENTION_ALPHA_CHECKED_IN',
        achievementName: 'Checked In',
        triggerEvent: 'convention_joined',
      },
      {
        userId: 'user-a',
        achievementId: 'first-catch',
        achievementKey: 'FIRST_CATCH',
        achievementName: 'First Catch',
        triggerEvent: 'catch_performed',
      },
    ];
    const notificationKeys = new Set();

    for (const summary of awardedSummaries) {
      const surfaceKey =
        getAchievementAwardSurfaceKey({
          achievementId: summary.achievementId,
          achievementKey: summary.achievementKey,
          achievementName: summary.achievementName,
          triggerEvent: summary.triggerEvent,
        }) ?? `achievement:${summary.achievementId}`;

      notificationKeys.add(`${summary.userId}:${surfaceKey}`);
    }

    assert.deepEqual(Array.from(notificationKeys).sort(), [
      'user-a:achievement:checked-in',
      'user-a:achievement:first-catch',
    ]);
  });

  it('keeps mobile toast dedupe wired to semantic Checked In surface', () => {
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
    const path = 'admin/lib/convention-gameplay-pack.ts';
    const source = read(path);

    assert.doesNotMatch(
      source,
      /keySuffix\s*:\s*["']CHECKED_IN["']/,
      `${path} must not seed Checked In`,
    );
    assert.match(source, /isCheckedInAchievementIdentity/, `${path} must identify catalog clones`);
    assert.match(source, /triggerEvent\s*:\s*catalogAchievement\s*\.\s*trigger_event/);
    assert.match(source, /continue;/, `${path} must skip Checked In catalog clones`);
  });

  it('blocks Checked In-style convention achievements in the admin write surface', () => {
    const path = 'admin/app/(dashboard)/conventions/actions.ts';
    const source = read(path);

    assert.match(source, /assertNotCheckedInConventionAchievement/);
    assert.ok(
      countMatches(source, /assertNotCheckedInConventionAchievement\s*\(/g) >= 3,
      `${path} must guard create, reactivate, and active update paths`,
    );
    assert.match(source, /\.select\s*\(\s*["']key\s*,\s*name\s*,\s*trigger_event["']\s*\)/);
    assert.match(source, /\.select\s*\(\s*["']key\s*,\s*is_active["']\s*\)/);
  });

  it('classifies Checked In identities in the admin app', async () => {
    const path = 'admin/lib/achievement-identity.ts';
    const { assertNotCheckedInConventionAchievement, isCheckedInAchievementIdentity } =
      await importTypeScriptModule(path);

    assert.equal(
      isCheckedInAchievementIdentity({ key: 'CONVENTION_ALPHA_CHECKED_IN', name: 'Checked In' }),
      true,
    );
    assert.equal(
      isCheckedInAchievementIdentity({
        key: 'EXPLORER',
        name: 'Explorer',
        triggerEvent: 'convention.checkin',
      }),
      true,
    );
    assert.equal(
      isCheckedInAchievementIdentity({
        key: 'CONVENTION_ALPHA_CROWD_FAVORITE',
        name: 'Crowd Favorite',
        triggerEvent: 'catch_performed',
      }),
      false,
    );
    assert.throws(
      () =>
        assertNotCheckedInConventionAchievement({
          key: 'CONVENTION_ALPHA_CHECKIN',
          name: 'Alpha Checkin',
        }),
      /Checked In is an account-level achievement/,
    );
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

describe('Early Bird achievement timing', () => {
  it('only treats 5:00-8:59 AM local convention time as early morning', () => {
    const source = read('supabase/functions/_shared/achievements.ts');
    const isEarlyBirdLocalTime = new Function(
      'localParts',
      functionBody(source, 'isEarlyBirdLocalTime'),
    );

    assert.equal(isEarlyBirdLocalTime({ hour: 4, minute: 59 }), false);
    assert.equal(isEarlyBirdLocalTime({ hour: 5, minute: 0 }), true);
    assert.equal(isEarlyBirdLocalTime({ hour: 8, minute: 59 }), true);
    assert.equal(isEarlyBirdLocalTime({ hour: 9, minute: 0 }), false);

    assert.doesNotMatch(
      source,
      /const isEarlyMorning = localParts \? localParts\.hour < 9 : false/,
    );
    assert.match(
      source,
      /const isEarlyMorning = localParts \? isEarlyBirdLocalTime\(localParts\) : false/,
    );
  });

  it('keeps Early Bird rule metadata aligned with the backend time window', () => {
    const source = read('packages/achievement-rules/src/rules/catch.ts');

    assert.match(source, /displayName: 'Early Bird'/);
    assert.match(source, /description: 'Make a catch from 5:00-8:59 AM local convention time\.'/);
    assert.match(source, /requiredStats: \['isEarlyMorning'\]/);
  });
});

describe('Familiar Face achievement', () => {
  it('defines the catcher-side repeat convention fursuit rule', () => {
    const source = read('packages/achievement-rules/src/rules/catch.ts');

    assert.match(source, /achievementKey: 'FAMILIAR_FACE'/);
    assert.match(source, /displayName: 'Familiar Face'/);
    assert.match(source, /description: 'Catch the same fursuit at 2 different conventions\.'/);
    assert.match(source, /requiredStats: \['distinctConventionsForCatcherFursuit'\]/);
    assert.match(
      source,
      /context\.stats\.distinctConventionsForCatcherFursuit >= 2[\s\S]*context\.catcherId/,
    );
    assert.doesNotMatch(source, /FAMILIAR_FACE[\s\S]{0,600}context\.fursuitOwnerId/);
  });

  it('collects the catcher/fursuit convention stat in the Edge Function', () => {
    const source = read('supabase/functions/_shared/achievements.ts');

    assert.match(source, /distinctConventionsForCatcherFursuit/);
    assert.match(source, /countDistinctConventionsForCatcherFursuit/);
    assert.match(source, /count_distinct_conventions_for_catcher_fursuit/);
  });

  it('seeds and silently backfills the achievement in the database migration', () => {
    const migration = read('supabase/migrations/20260603022216_add_familiar_face_achievement.sql');

    assert.match(
      migration,
      /create or replace function public\.count_distinct_conventions_for_catcher_fursuit/,
    );
    assert.match(migration, /'FAMILIAR_FACE'/);
    assert.match(migration, /'Familiar Face'/);
    assert.match(migration, /insert into public\.user_achievements/);
    assert.match(migration, /on conflict \(user_id, achievement_id\) do nothing/);
    assert.doesNotMatch(migration, /insert into public\.notifications/);
  });
});
