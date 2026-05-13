import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { URL } from 'node:url';

const root = new URL('..', import.meta.url).pathname;
const dashboardRoot = join(root, 'src', 'routes', '(dashboard)');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function walk(dir, predicate, results = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, predicate, results);
    } else if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

const sensitiveServerLoaders = walk(
  dashboardRoot,
  (path) =>
    path.endsWith('+page.server.ts') &&
    /(\$lib\/server\/data|\$lib\/server\/analytics|\$lib\/server\/convention-lifecycle)/.test(
      readFileSync(path, 'utf8'),
    ),
);

describe('admin-v2 SSR security boundaries', () => {
  it('requires authenticated data context before dashboard service-role reads', () => {
    assert.ok(sensitiveServerLoaders.length > 0, 'expected sensitive server loaders to be found');

    for (const loaderPath of sensitiveServerLoaders) {
      const source = readFileSync(loaderPath, 'utf8');
      const label = relative(root, loaderPath);
      const guardIndex = source.indexOf('requireAdminDataContext');
      const dataReadIndex = source.search(/fetch[A-Z]\w+\(|buildConvention[A-Z]\w+\(/);

      assert.notEqual(guardIndex, -1, `${label} must import and call requireAdminDataContext`);
      assert.notEqual(dataReadIndex, -1, `${label} should contain a server data read`);
      assert.ok(guardIndex < dataReadIndex, `${label} must guard before server data reads`);
    }
  });

  it('keeps service-role data helpers caller-gated', () => {
    for (const path of ['src/lib/server/data.ts', 'src/lib/server/analytics.ts']) {
      const source = read(path);

      assert.doesNotMatch(
        source,
        /createServiceRoleClient\(\)/,
        `${path} must not create a service-role client internally`,
      );
      assert.match(
        source,
        /ServiceRoleClient/,
        `${path} must require an authenticated service-role client from callers`,
      );
    }
  });

  it('centralizes no-store authenticated service-role context', () => {
    const source = read('src/lib/server/auth.ts');

    assert.match(source, /requireAdminDataContext/, 'auth helper must expose data context guard');
    assert.match(source, /cache-control/, 'data context guard must disable response caching');
    assert.match(
      source,
      /requireAdminProfile\(cookies, allowed\)/,
      'data context guard must validate the admin profile',
    );
    assert.match(
      source,
      /createServiceRoleClient\(\)/,
      'data context guard is the allowed service-role creation point for SSR reads',
    );
  });

  it('protects browser, data, and API requests in the server hook', () => {
    const source = read('src/hooks.server.ts');

    assert.match(source, /supabase\.auth\.getUser\(\)/, 'hook must validate Supabase Auth');
    assert.match(source, /\.from\('profiles'\)/, 'hook must check the profile role');
    assert.match(source, /ADMIN_ROLES/, 'hook must enforce admin roles');
    assert.match(source, /event\.isDataRequest/, 'SvelteKit data requests must deny as JSON');
    assert.match(source, /pathname\.startsWith\('\/api\/'\)/, 'API requests must deny as JSON');
    assert.match(source, /'\/api\/geocode'/, 'only the geocode proxy is explicitly public');
    assert.match(
      source,
      /!pathname\.startsWith\('\/api\/'\)/,
      'static asset bypass must not exempt API storage paths with image extensions',
    );
  });

  it('keeps protected API route handlers gated before service-role access', () => {
    for (const path of [
      'src/routes/api/conventions/[id]/catches/export/+server.ts',
      'src/routes/api/storage/[bucket]/[...path]/+server.ts',
    ]) {
      const source = read(path);
      const guardIndex = source.search(/await\s+requireAdminProfile\(/);
      const serviceIndex = source.search(/createServiceRoleClient\(\)/);

      assert.notEqual(guardIndex, -1, `${path} must require an admin profile`);
      assert.notEqual(serviceIndex, -1, `${path} must use service-role access only after auth`);
      assert.ok(guardIndex < serviceIndex, `${path} must gate before service-role access`);
    }
  });
});
