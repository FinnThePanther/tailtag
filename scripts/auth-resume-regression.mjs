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

function typescriptFunctionBody(source, name) {
  let start = source.indexOf(`function ${name}`);
  if (start === -1) {
    start = source.indexOf(`const ${name} =`);
  }
  assert.notEqual(start, -1, `expected ${name} to be defined`);

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

describe('Auth warm resume routing', () => {
  it('keeps a foreground session-checking state distinct from signed out', () => {
    const source = read('src/features/auth/providers/AuthProvider.tsx');

    assert.match(
      source,
      /type AuthStatus = 'loading' \| 'checking_session' \| 'signed_in' \| 'signed_out'/,
    );
    assert.match(source, /isRevalidatingSessionRef/);
    assert.match(source, /pendingSignedOutDuringCheckRef/);
    assert.match(source, /event === 'SIGNED_OUT'/);
    assert.match(source, /Deferring signed-out event during session check/);
  });

  it('manages Supabase auto refresh from React Native AppState', () => {
    const source = read('src/features/auth/providers/AuthProvider.tsx');

    assert.match(source, /AppState\.addEventListener\('change', handleAppStateChange\)/);
    assert.match(source, /supabase\.auth\.startAutoRefresh\(\)/);
    assert.match(source, /supabase\.auth\.stopAutoRefresh\(\)/);
    assert.match(source, /nextState === 'active'/);
    assert.match(source, /resolveSession\('foreground'\)/);
  });

  it('only redirects to auth after a stable signed-out state', () => {
    const source = read('app/_layout.tsx');

    assert.doesNotMatch(source, /if \(!session && !inPublicAuthFlow\)/);
    assert.match(source, /status === 'signed_out' && !session && !inPublicAuthFlow/);
  });

  it('keeps explicit settings sign-out immediate through the auth provider', () => {
    const source = read('app/(tabs)/settings.tsx');
    const handleSignOutBody = typescriptFunctionBody(source, 'handleSignOut');

    assert.match(source, /const \{ session, signOut, forceSignOut \} = useAuth\(\)/);
    assert.match(handleSignOutBody, /await signOut\(\)/);
    assert.doesNotMatch(handleSignOutBody, /supabase\.auth\.signOut\(\)/);
  });
});
