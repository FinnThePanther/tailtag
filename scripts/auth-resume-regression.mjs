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
  });

  vm.runInContext(outputText, context, { filename: path });
  return module.exports;
}

const {
  applyAuthStateChange,
  beginForegroundSessionCheck,
  completeSessionResolution,
  createAuthResumeState,
  setIntentionalSignOut,
  shouldRedirectToAuth,
} = loadTypeScriptModule('src/features/auth/providers/authResumeState.ts');

const signedInSession = {
  access_token: 'access-token-1',
  user: { id: 'user-1', email: 'user@example.com' },
};

const refreshedSession = {
  access_token: 'access-token-2',
  user: { id: 'user-1', email: 'user@example.com' },
};

describe('Auth warm resume behavior', () => {
  it('enters checking_session on foreground resume without clearing the current session', () => {
    const initialState = createAuthResumeState(signedInSession, 'signed_in');
    const checkingState = beginForegroundSessionCheck(initialState);

    assert.equal(checkingState.status, 'checking_session');
    assert.equal(checkingState.session, signedInSession);
    assert.equal(checkingState.isRevalidatingSession, true);
    assert.equal(
      shouldRedirectToAuth(checkingState.status, Boolean(checkingState.session), false),
      false,
    );
  });

  it('preserves the last confirmed session when foreground getSession briefly returns null', () => {
    const checkingState = beginForegroundSessionCheck(
      createAuthResumeState(signedInSession, 'signed_in'),
    );
    const { state, preservedSession } = completeSessionResolution(
      checkingState,
      'foreground',
      null,
    );

    assert.equal(preservedSession, true);
    assert.equal(state.status, 'signed_in');
    assert.equal(state.session, signedInSession);
    assert.equal(state.isRevalidatingSession, false);
    assert.equal(shouldRedirectToAuth(state.status, Boolean(state.session), false), false);
  });

  it('applies a refreshed foreground session when Supabase returns one', () => {
    const checkingState = beginForegroundSessionCheck(
      createAuthResumeState(signedInSession, 'signed_in'),
    );
    const { state, preservedSession } = completeSessionResolution(
      checkingState,
      'foreground',
      refreshedSession,
    );

    assert.equal(preservedSession, false);
    assert.equal(state.status, 'signed_in');
    assert.equal(state.session, refreshedSession);
    assert.equal(state.isRevalidatingSession, false);
    assert.equal(shouldRedirectToAuth(state.status, Boolean(state.session), false), false);
  });

  it('only moves to signed_out after a deferred sign-out event is confirmed by foreground resolution', () => {
    const checkingState = beginForegroundSessionCheck(
      createAuthResumeState(signedInSession, 'signed_in'),
    );
    const deferred = applyAuthStateChange(checkingState, 'SIGNED_OUT', null);

    assert.equal(deferred.deferred, true);
    assert.equal(deferred.state.status, 'checking_session');
    assert.equal(deferred.state.session, signedInSession);
    assert.equal(deferred.state.pendingSignedOutDuringCheck, true);
    assert.equal(
      shouldRedirectToAuth(deferred.state.status, Boolean(deferred.state.session), false),
      false,
    );

    const confirmed = completeSessionResolution(deferred.state, 'foreground', null);

    assert.equal(confirmed.preservedSession, false);
    assert.equal(confirmed.state.status, 'signed_out');
    assert.equal(confirmed.state.session, null);
    assert.equal(
      shouldRedirectToAuth(confirmed.state.status, Boolean(confirmed.state.session), false),
      true,
    );
  });

  it('keeps explicit sign-out immediate instead of deferring during a foreground check', () => {
    const checkingState = beginForegroundSessionCheck(
      createAuthResumeState(signedInSession, 'signed_in'),
    );
    const intentionalState = setIntentionalSignOut(checkingState, true);
    const signedOut = applyAuthStateChange(intentionalState, 'SIGNED_OUT', null);

    assert.equal(signedOut.deferred, false);
    assert.equal(signedOut.state.status, 'signed_out');
    assert.equal(signedOut.state.session, null);
    assert.equal(
      shouldRedirectToAuth(signedOut.state.status, Boolean(signedOut.state.session), false),
      true,
    );
  });

  it('does not redirect auth/public flows or active session checks to auth', () => {
    assert.equal(shouldRedirectToAuth('signed_out', false, true), false);
    assert.equal(shouldRedirectToAuth('checking_session', false, false), false);
    assert.equal(shouldRedirectToAuth('signed_in', true, false), false);
    assert.equal(shouldRedirectToAuth('signed_out', false, false), true);
  });
});
