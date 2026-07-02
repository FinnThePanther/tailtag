import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptsDir, '..');
const asyncCloseoutMigrationPath =
  'supabase/migrations/20260605170000_async_convention_closeout_dispatch.sql';
const closeOutConventionFunctionPath = 'supabase/functions/close-out-convention/index.ts';

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

function plpgsqlFunctionBody(source, schema, name) {
  const signaturePattern = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${schema}\\.${name}\\s*\\(`,
    'i',
  );
  const signature = signaturePattern.exec(source);
  assert.ok(signature, `expected ${schema}.${name} to be defined`);

  const start = source.indexOf('AS $$', signature.index);
  assert.notEqual(start, -1, `expected ${schema}.${name} to use AS $$`);

  const bodyStart = start + 'AS $$'.length;
  const bodyEnd = source.indexOf('$$;', bodyStart);
  assert.notEqual(bodyEnd, -1, `expected ${schema}.${name} body terminator`);

  return source.slice(bodyStart, bodyEnd);
}

function typescriptFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
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

describe('Convention lifecycle automation', () => {
  it('dispatches closeout asynchronously from cron', () => {
    const source = read(asyncCloseoutMigrationPath);
    const invokeBody = plpgsqlFunctionBody(source, 'app_private', 'invoke_convention_closeout');

    assert.match(invokeBody, /net\.http_post\(/);
    assert.doesNotMatch(invokeBody, /http_collect_response/);
    assert.match(invokeBody, /closeout_last_attempt_at\s*=\s*v_dispatched_at/);
    assert.match(invokeBody, /'convention_id'\s*,\s*p_convention_id::text/);
    assert.match(invokeBody, /'source'\s*,\s*p_source/);
  });

  it('keeps lifecycle cron schedule and dispatch throttles in place', () => {
    const source = read(asyncCloseoutMigrationPath);
    const jobBody = plpgsqlFunctionBody(
      source,
      'app_private',
      'convention_lifecycle_automation_job',
    );

    assert.match(source, /schedule\s*:=\s*'\*\/5 \* \* \* \*'/);
    assert.match(source, /'convention-lifecycle-automation'/);
    assert.match(jobBody, /c\.closeout_last_attempt_at < now\(\) - interval '1 hour'/);
    assert.match(jobBody, /c\.closeout_last_attempt_at < now\(\) - interval '6 hours'/);
    assert.match(jobBody, /al\.created_at >= now\(\) - interval '1 hour'/);
    assert.match(jobBody, /al\.created_at >= now\(\) - interval '6 hours'/);
  });

  it('keeps claimed closeout rows aligned with recap eligibility fields', () => {
    const source = read(closeOutConventionFunctionPath);
    const claimCloseoutBody = typescriptFunctionBody(source, 'claimCloseout');

    assert.match(claimCloseoutBody, /'started_at'/);
    assert.match(claimCloseoutBody, /'geofence_enabled'/);
    assert.match(claimCloseoutBody, /'location_verification_required'/);
    assert.match(claimCloseoutBody, /buildRecaps|closeout_not_before/);
  });

  it('notifies pre-enrolled attendees when live location checks are ready', () => {
    const { source } = readLatestMigrationMatching(
      /notify_live_convention_location_checks[\s\S]*convention-started-location-check/,
    );
    const notifyBody = plpgsqlFunctionBody(
      source,
      'app_private',
      'notify_live_convention_location_checks',
    );
    const jobBody = plpgsqlFunctionBody(
      source,
      'app_private',
      'convention_lifecycle_automation_job',
    );

    assert.match(notifyBody, /public\.is_convention_joinable\(c\.id\)/);
    assert.match(notifyBody, /COALESCE\(c\.location_verification_required, false\) = true/);
    assert.match(notifyBody, /pc\.created_at < live_conventions\.effective_started_at/);
    assert.match(notifyBody, /public\.is_profile_convention_gameplay_eligible/);
    assert.match(notifyBody, /p\.push_notifications_enabled = true/);
    assert.match(notifyBody, /NULLIF\(btrim\(p\.expo_push_token\), ''\) IS NOT NULL/);
    assert.match(notifyBody, /'convention_started'/);
    assert.match(notifyBody, /'convention-started-location-check:'/);
    assert.match(notifyBody, /pc\.playable_notified_at IS NULL/);
    assert.match(notifyBody, /SET playable_notified_at = p_now/);
    assert.match(
      notifyBody,
      /ON CONFLICT \(\s*user_id,\s*type,\s*dedupe_key\s*\)[\s\S]*DO NOTHING/,
    );

    assert.match(jobBody, /transition_started_conventions_to_live\(\)/);
    assert.match(jobBody, /notify_live_convention_location_checks\(\)/);
    assert.match(source, /PERFORM app_private\.notify_live_convention_location_checks\(\);/);
  });
});
