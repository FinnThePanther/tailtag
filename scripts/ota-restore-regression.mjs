import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptsDir, '..');
const require = createRequire(import.meta.url);

function loadTypeScriptModule(path) {
  const source = readFileSync(join(root, path), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const module = { exports: {} };
  const context = vm.createContext({
    exports: module.exports,
    module,
    require,
    URL,
    URLSearchParams,
  });

  vm.runInContext(outputText, context, { filename: path });
  return module.exports;
}

const {
  OTA_RESTORE_TTL_MS,
  createOtaRestoreHref,
  createOtaRestoreRouteSnapshot,
  createPendingOtaRestoreSnapshot,
  getOtaRestoreRoutingDecision,
  getOtaUpdateApplicationDecision,
  isSafeOtaRestoreHref,
  resolvePendingOtaRestoreSnapshot,
} = loadTypeScriptModule('src/hooks/otaRestoreState.ts');

const now = 1_800_000_000_000;
const userId = 'user-1';

function createPendingSnapshot(href = '/profile/user-1') {
  const routeSnapshot = createOtaRestoreRouteSnapshot({ href, userId, now });
  return createPendingOtaRestoreSnapshot(routeSnapshot, now);
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createReadyRoutingState(overrides = {}) {
  return {
    hasSession: true,
    status: 'signed_in',
    hasPendingInitialRoutingCheck: false,
    shouldShowLoadingScreen: false,
    hasRedirectHref: false,
    shouldResolvePostAuthDestination: false,
    hasPendingInviteToken: false,
    inPublicAuthFlow: false,
    shouldGateLegalConsent: false,
    shouldGateAgeAttestation: false,
    shouldGateOnboarding: false,
    hasProfileBlockingError: false,
    isSuspended: false,
    ...overrides,
  };
}

describe('OTA warm restore policy', () => {
  it('restores a safe route for the same signed-in user', () => {
    const snapshot = createPendingSnapshot('/profile/user-1?tab=suits');
    const resolution = resolvePendingOtaRestoreSnapshot(snapshot, {
      now: now + 1_000,
      userId,
      canRestore: true,
    });

    assert.deepEqual(toPlain(resolution), {
      action: 'restore',
      href: '/profile/user-1?tab=suits',
    });
  });

  it('rejects auth, gate, invite, and account-sensitive routes', () => {
    const deniedRoutes = [
      '/auth',
      '/forgot-password',
      '/reset-password',
      '/invite/token-1',
      '/onboarding',
      '/age-gate',
      '/legal-consent',
      '/change-password',
    ];

    deniedRoutes.forEach((href) => {
      assert.equal(isSafeOtaRestoreHref(href), false, href);
      assert.equal(createOtaRestoreRouteSnapshot({ href, userId, now }), null, href);
    });
  });

  it('rejects malformed or unsafe href values', () => {
    const unsafeHrefs = [
      '',
      'tailtag://profile/user-1',
      'https://playtailtag.com/profile/user-1',
      '//profile/user-1',
    ];

    unsafeHrefs.forEach((href) => {
      assert.equal(isSafeOtaRestoreHref(href), false, href);
    });
  });

  it('clears expired, signed-out, wrong-user, and invalid snapshots', () => {
    const snapshot = createPendingSnapshot();

    assert.deepEqual(
      toPlain(
        resolvePendingOtaRestoreSnapshot(snapshot, {
          now: now + OTA_RESTORE_TTL_MS,
          userId,
          canRestore: true,
        }),
      ),
      { action: 'clear', reason: 'expired' },
    );

    assert.deepEqual(
      toPlain(
        resolvePendingOtaRestoreSnapshot(snapshot, {
          now,
          userId: null,
          canRestore: true,
        }),
      ),
      { action: 'clear', reason: 'signed-out' },
    );

    assert.deepEqual(
      toPlain(
        resolvePendingOtaRestoreSnapshot(snapshot, {
          now,
          userId: 'user-2',
          canRestore: true,
        }),
      ),
      { action: 'clear', reason: 'wrong-user' },
    );

    assert.deepEqual(
      toPlain(
        resolvePendingOtaRestoreSnapshot(null, {
          now,
          userId,
          canRestore: true,
        }),
      ),
      { action: 'clear', reason: 'invalid' },
    );
  });

  it('defers restore while higher-priority routing is not ready', () => {
    const snapshot = createPendingSnapshot('/catches/catch-1');

    assert.deepEqual(
      toPlain(
        resolvePendingOtaRestoreSnapshot(snapshot, {
          now,
          userId,
          canRestore: false,
        }),
      ),
      { action: 'defer', reason: 'routing-not-ready' },
    );
  });

  it('waits for unresolved startup routing before restoring', () => {
    assert.deepEqual(
      toPlain(getOtaRestoreRoutingDecision(createReadyRoutingState({ status: 'loading' }))),
      { action: 'wait', reason: 'auth-loading' },
    );

    assert.deepEqual(
      toPlain(
        getOtaRestoreRoutingDecision(
          createReadyRoutingState({ hasPendingInitialRoutingCheck: true }),
        ),
      ),
      { action: 'wait', reason: 'initial-routing-check' },
    );

    assert.deepEqual(
      toPlain(
        getOtaRestoreRoutingDecision(createReadyRoutingState({ shouldShowLoadingScreen: true })),
      ),
      { action: 'wait', reason: 'route-loading' },
    );
  });

  it('skips restore when normal routing has a higher-priority destination', () => {
    [
      { hasSession: false },
      { hasRedirectHref: true },
      { hasPendingInviteToken: true },
      { inPublicAuthFlow: true },
      { shouldGateLegalConsent: true },
      { shouldGateAgeAttestation: true },
      { shouldGateOnboarding: true },
      { hasProfileBlockingError: true },
      { isSuspended: true },
    ].forEach((overrides) => {
      const decision = getOtaRestoreRoutingDecision(createReadyRoutingState(overrides));

      assert.equal(decision.action, 'skip', JSON.stringify(overrides));
    });
  });

  it('allows restore only after auth and higher-priority routing are settled', () => {
    assert.deepEqual(toPlain(getOtaRestoreRoutingDecision(createReadyRoutingState())), {
      action: 'restore-ready',
    });
  });

  it('builds stable safe href values from path and search params', () => {
    assert.equal(
      createOtaRestoreHref('/leaderboard/convention-1', {
        filter: 'friends',
        screen: 'ignored',
        params: 'ignored',
        tag: ['first', 'second'],
      }),
      '/leaderboard/convention-1?filter=friends&tag=first&tag=second',
    );
  });

  it('defers warm active updates and reloads cold or background updates', () => {
    assert.equal(
      getOtaUpdateApplicationDecision({ blockUi: false, appState: 'active' }),
      'mark-pending-warm-update',
    );
    assert.equal(
      getOtaUpdateApplicationDecision({ blockUi: true, appState: 'active' }),
      'reload-now',
    );
    assert.equal(
      getOtaUpdateApplicationDecision({ blockUi: false, appState: 'background' }),
      'reload-now',
    );
  });
});
