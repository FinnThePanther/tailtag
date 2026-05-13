import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { URL } from 'node:url';

const root = new URL('..', import.meta.url).pathname;
const dashboardRoot = join(root, 'app', '(dashboard)');

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

const sensitiveDashboardPages = walk(
  dashboardRoot,
  (path) => path.endsWith('page.tsx') && readFileSync(path, 'utf8').includes('@/lib/data'),
);

describe('admin SSR security boundaries', () => {
  it('requires authenticated data context before dashboard service-role reads', () => {
    assert.ok(sensitiveDashboardPages.length > 0, 'expected sensitive dashboard pages to be found');

    for (const pagePath of sensitiveDashboardPages) {
      const source = readFileSync(pagePath, 'utf8');
      const label = relative(root, pagePath);
      const guardIndex = source.indexOf('requireAdminDataContext');
      const dataReadIndex = source.search(/fetch[A-Z]\w+\(/);

      assert.notEqual(guardIndex, -1, `${label} must import and call requireAdminDataContext`);
      assert.notEqual(dataReadIndex, -1, `${label} should contain a server data read`);
      assert.ok(guardIndex < dataReadIndex, `${label} must guard before server data reads`);
    }
  });

  it('keeps service-role data helpers caller-gated', () => {
    for (const path of ['lib/data.ts', 'lib/analytics.ts']) {
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
    const source = read('lib/auth.ts');

    assert.match(source, /requireAdminDataContext/, 'auth helper must expose data context guard');
    assert.match(source, /noStore\(\)/, 'data context guard must disable response caching');
    assert.match(
      source,
      /requireAdminProfile\(allowed\)/,
      'data context guard must validate the admin profile',
    );
    assert.match(
      source,
      /createServiceRoleClient\(\)/,
      'data context guard is the allowed service-role creation point for SSR reads',
    );
  });

  it('protects browser, RSC, prefetch, and API requests in middleware', () => {
    const source = read('middleware.ts');

    assert.match(source, /supabase\.auth\.getUser\(\)/, 'middleware must validate Supabase Auth');
    assert.match(source, /\.from\('profiles'\)/, 'middleware must check the profile role');
    assert.match(source, /ADMIN_ROLES/, 'middleware must enforce admin roles');
    assert.match(source, /pathname\.startsWith\('\/api\/'\)/, 'API requests must deny as JSON');
    assert.match(source, /headers\.get\('rsc'\) === '1'/, 'RSC requests must deny as JSON');
    assert.match(
      source,
      /headers\.has\('next-router-prefetch'\)/,
      'prefetch requests must deny as JSON',
    );
    assert.match(source, /'\/api\/:path\*'/, 'all API routes must run through middleware');
    assert.match(source, /'\/api\/geocode'/, 'only the geocode proxy is explicitly public');
  });

  it('keeps protected API route handlers gated before service-role access', () => {
    for (const path of [
      'app/api/conventions/[id]/catches/export/route.ts',
      'app/api/storage/[bucket]/[...path]/route.ts',
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
