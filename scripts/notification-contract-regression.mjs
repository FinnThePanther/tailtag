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
});
