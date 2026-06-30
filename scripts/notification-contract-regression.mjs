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

  return {
    file: migration,
    source: readFileSync(join(migrationsDir, migration), 'utf8'),
  };
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

describe('Notification contract coverage', () => {
  it('keeps push worker support aligned with the shared notification contract', async () => {
    const { PUSH_NOTIFICATION_TYPES, IN_APP_ONLY_NOTIFICATION_TYPES } =
      await importTypeScriptModule('packages/notification-contract/src/index.ts');
    const sendPushSource = read('supabase/functions/send-push/index.ts');

    assert.match(sendPushSource, /packages\/notification-contract\/src\/index\.ts/);
    assert.doesNotMatch(sendPushSource, /SUPPORTED_TYPES/);
    assert.match(sendPushSource, /isPushNotificationType\(notificationType\)/);
    assert.match(sendPushSource, /isInAppOnlyNotificationType\(notificationType\)/);

    for (const type of PUSH_NOTIFICATION_TYPES) {
      assert.match(sendPushSource, new RegExp(`case '${type}'`), `${type} needs a push template`);
    }

    for (const type of IN_APP_ONLY_NOTIFICATION_TYPES) {
      assert.ok(
        sendPushSource.includes(type) || sendPushSource.includes('isInAppOnlyNotificationType'),
        `${type} needs explicit in-app-only handling`,
      );
    }
  });

  it('routes every push notification type mobile can receive', async () => {
    const { PUSH_NOTIFICATION_TYPES } = await importTypeScriptModule(
      'packages/notification-contract/src/index.ts',
    );
    const mobileSource = read('src/features/push-notifications/types.ts');

    assert.match(mobileSource, /packages\/notification-contract\/src/);

    for (const type of PUSH_NOTIFICATION_TYPES) {
      if (type === 'convention_recap_ready') {
        assert.match(mobileSource, /type === 'convention_recap_ready'/);
        assert.match(mobileSource, /recap_id/);
        continue;
      }

      if (type === 'catch_invite_approved') {
        assert.match(mobileSource, /type === 'catch_invite_approved'/);
        assert.match(mobileSource, /catch_id/);
      }

      assert.match(
        mobileSource,
        new RegExp(`${type}:`),
        `${type} needs a static mobile fallback route`,
      );
    }
  });

  it('shows foreground realtime toasts for catch invite push types', async () => {
    const catchToastSource = read(
      'src/features/catch-confirmations/components/CatchConfirmationToastManager.tsx',
    );
    const catchInviteTypes = [
      'catch_invite_claimed',
      'catch_invite_approved',
      'catch_invite_declined',
      'catch_invite_reported',
    ];

    for (const type of catchInviteTypes) {
      assert.match(
        catchToastSource,
        new RegExp(`'${type}'`),
        `${type} needs catchup/realtime registration`,
      );
      assert.match(catchToastSource, new RegExp(`case '${type}'`), `${type} needs a toast case`);
    }

    assert.match(catchToastSource, /catch_invite_id/);
  });

  it('gates level-up push delivery and foreground toasts behind player leveling rollout', () => {
    const { source } = readLatestMigrationMatching(/level_up[\s\S]*player_leveling_ui/);
    const sendPushSource = read('supabase/functions/send-push/index.ts');
    const achievementToastSource = read(
      'src/features/achievements/components/AchievementToastManager.tsx',
    );

    assert.match(source, /v_notification\.type = 'level_up'/);
    assert.match(
      source,
      /is_feature_enabled_for_profile\('player_leveling_ui', v_notification\.user_id\)/,
    );
    assert.match(source, /IF v_job_id IS NULL THEN[\s\S]*RETURN NEW;/);

    assert.match(sendPushSource, /PLAYER_LEVELING_UI_FEATURE_KEY = 'player_leveling_ui'/);
    const levelUpFeatureFlagHelper = sendPushSource.match(
      /async function isPlayerLevelingPushEnabled[\s\S]*?\n}/,
    )?.[0];
    const levelUpPushGuard = sendPushSource.match(
      /if \(notificationType === 'level_up'\) \{[\s\S]*?skipReason: 'Feature disabled'[\s\S]*?\n  \}/,
    )?.[0];

    assert.ok(levelUpFeatureFlagHelper, 'Expected player leveling feature flag helper to exist');
    assert.ok(levelUpPushGuard, 'Expected level_up delivery guard to exist');
    assert.match(levelUpFeatureFlagHelper, /PLAYER_LEVELING_UI_FEATURE_KEY/);
    assert.match(levelUpPushGuard, /notificationType === 'level_up'/);
    assert.match(levelUpPushGuard, /skipReason: 'Feature disabled'/);

    const levelUpToastHandler = achievementToastSource.match(
      /const handleLevelUp = \([\s\S]*?\n    \};\n\n    const catchUpAchievementNotifications/,
    )?.[0];
    const achievementCatchUpBlock = achievementToastSource.match(
      /const catchUpAchievementNotifications = async \(\) => \{[\s\S]*?\n    \};\n\n    const updateDailyTasksSummary/,
    )?.[0];

    assert.match(achievementToastSource, /PLAYER_LEVELING_UI_FEATURE_KEY/);
    assert.ok(levelUpToastHandler, 'Expected level_up toast handler to exist');
    assert.match(levelUpToastHandler, /isPlayerLevelingUiEnabled !== true/);
    assert.match(levelUpToastHandler, /surfacedLevelUpNotificationIdsRef/);
    assert.match(
      levelUpToastHandler,
      /surfacedLevelUpNotificationIdsRef\.current\.has\(notificationId\)[\s\S]*surfacedIds\.add\(notificationId\)[\s\S]*isPlayerLevelingUiEnabled !== true/,
    );
    assert.ok(achievementCatchUpBlock, 'Expected achievement catch-up block to exist');
    assert.match(achievementCatchUpBlock, /isPlayerLevelingUiEnabled === true/);
    assert.match(achievementCatchUpBlock, /'level_up'/);
    assert.match(achievementCatchUpBlock, /handleLevelUp\(row\.id, notificationPayload\)/);
  });

  it('ensures profiles exist before push write calls that need a profile row', () => {
    const pushApiSource = read('src/features/push-notifications/api/pushNotifications.ts');

    assert.match(pushApiSource, /ensureCurrentUserProfileExists/);

    assert.match(
      pushApiSource,
      /registerPushToken[\s\S]*?ensureCurrentUserProfileExists\(userId\)[\s\S]*?supabase\.rpc\('register_push_token'/,
    );
    assert.match(
      pushApiSource,
      /updatePushPreference[\s\S]*?ensureCurrentUserProfileExists\(userId\)[\s\S]*?from\('profiles'\)\.update/,
    );

    const clearPushTokenSource = pushApiSource.match(
      /export async function clearPushToken[\s\S]*?(?=\nexport async function|$)/,
    )?.[0];

    assert.ok(clearPushTokenSource, 'Expected clearPushToken export to exist');
    assert.doesNotMatch(clearPushTokenSource, /ensureCurrentUserProfileExists/);
  });

  it('keeps register_push_token tolerant of missing profile rows', () => {
    const { file, source } = readLatestMigrationMatching(/register_push_token\(\s*p_user_id uuid/);

    assert.match(file, /^202606/);
    assert.match(
      source,
      /CREATE OR REPLACE FUNCTION public\.register_push_token\(\s*p_user_id uuid,\s*p_expo_push_token text\s*\)/,
    );
    assert.match(source, /IF auth\.uid\(\) IS DISTINCT FROM v_effective_user THEN/);
    assert.match(source, /IF v_token IS NULL THEN/);
    assert.match(source, /pg_advisory_xact_lock\(hashtextextended\(v_token, 0\)\)/);
    assert.match(
      source,
      /INSERT INTO public\.profiles \(id\)\s+VALUES \(v_effective_user\)\s+ON CONFLICT \(id\) DO NOTHING;/,
    );
    assert.match(source, /GRANT EXECUTE ON FUNCTION public\.register_push_token\(uuid, text\)/);
  });
});
