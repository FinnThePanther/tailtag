import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function readMigrationMatchingFile(pattern) {
  const migrationsDir = join(root, 'supabase/migrations');
  const migration = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .find((file) => pattern.test(file));

  assert.ok(migration, `Expected to find migration file matching ${pattern}`);

  return {
    file: migration,
    source: readFileSync(join(migrationsDir, migration), 'utf8'),
  };
}

describe('Backend worker bookkeeping', () => {
  it('adds compact heartbeat storage and service-role RPC access', () => {
    const { file, source } = readMigrationMatchingFile(
      /^20260626120000_add_backend_worker_heartbeats\.sql$/,
    );

    assert.equal(file, '20260626120000_add_backend_worker_heartbeats.sql');
    assert.match(source, /CREATE TABLE IF NOT EXISTS public\.backend_worker_heartbeats/);
    assert.match(source, /worker_name text PRIMARY KEY/);
    assert.match(source, /last_idle_counts jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
    assert.match(
      source,
      /idle_count_window_started_at timestamp with time zone NOT NULL DEFAULT now\(\)/,
    );
    assert.match(source, /idle_count_24h integer NOT NULL DEFAULT 0/);
    assert.match(source, /CREATE OR REPLACE FUNCTION public\.record_backend_worker_heartbeat/);
    assert.match(
      source,
      /public\.backend_worker_heartbeats\.idle_count_window_started_at < v_now - interval '24 hours'/,
    );
    assert.match(source, /IF \(SELECT auth\.role\(\)\) <> 'service_role' THEN/);
    assert.match(source, /RAISE EXCEPTION 'record_backend_worker_heartbeat requires service_role'/);
    assert.match(
      source,
      /REVOKE ALL ON FUNCTION public\.record_backend_worker_heartbeat\(\s+text,\s+text,\s+text,\s+timestamp with time zone,\s+integer,\s+jsonb,\s+jsonb\s+\) FROM PUBLIC, anon, authenticated/,
    );
    assert.match(source, /GRANT EXECUTE ON FUNCTION public\.record_backend_worker_heartbeat/);
    assert.match(source, /TO service_role/);
  });

  it('keeps the heartbeat window repair migration idempotent', () => {
    const { file, source } = readLatestMigrationMatching(
      /ADD COLUMN IF NOT EXISTS idle_count_window_started_at/,
    );

    assert.equal(file, '20260626215000_repair_backend_worker_heartbeat_window.sql');
    assert.match(
      source,
      /ALTER TABLE public\.backend_worker_heartbeats\s+ADD COLUMN IF NOT EXISTS idle_count_window_started_at timestamp with time zone NOT NULL DEFAULT now\(\)/,
    );
    assert.match(source, /CREATE OR REPLACE FUNCTION public\.record_backend_worker_heartbeat/);
    assert.match(
      source,
      /public\.backend_worker_heartbeats\.idle_count_window_started_at < v_now - interval '24 hours'/,
    );
    assert.match(source, /GRANT EXECUTE ON FUNCTION public\.record_backend_worker_heartbeat/);
    assert.match(source, /TO service_role/);
  });

  it('exposes heartbeat fields from backend worker health without changing run history signals', () => {
    const { source } = readLatestMigrationMatching(/last_heartbeat_at/);

    for (const field of [
      'last_heartbeat_at timestamp with time zone',
      'last_idle_at timestamp with time zone',
      'last_idle_counts jsonb',
      'idle_count_24h integer',
    ]) {
      assert.match(source, new RegExp(field.replace(/[ ]/g, '\\s+')));
    }

    assert.match(source, /FROM public\.backend_worker_runs r\s+WHERE r\.status = 'succeeded'/);
    assert.match(
      source,
      /FROM public\.backend_worker_runs r\s+WHERE r\.status IN \('failed', 'partial'\)/,
    );
    assert.match(source, /LEFT JOIN public\.backend_worker_heartbeats hb USING \(worker_name\)/);
  });

  it('keeps worker-aware idle detection in the shared helper', () => {
    const source = read('supabase/functions/_shared/backendWorkerRuns.ts');

    assert.match(source, /export async function completeOrHeartbeatBackendWorkerRun/);
    assert.match(source, /handle\.source !== 'cron' \|\| options\.status !== 'succeeded'/);

    for (const [worker, countKey] of [
      ['push_delivery', 'jobs_claimed'],
      ['push_receipt_polling', 'receipts_claimed'],
      ['gameplay_queue_drain', 'fetched'],
      ['daily_task_rotation', 'conventions_processed'],
      ['pending_catch_expiration', 'expired_catches'],
    ]) {
      assert.match(
        source,
        new RegExp(
          `case '${worker}':[\\s\\S]*?numericCount\\(options\\.counts, '${countKey}'\\) === 0`,
        ),
      );
    }

    assert.match(source, /\.from\('backend_worker_runs'\)\.delete\(\)\.eq\('id', handle\.id\)/);
    assert.match(source, /\.rpc\('record_backend_worker_heartbeat'/);
    assert.match(source, /await completeBackendWorkerRun\(supabaseAdmin, handle, options\)/);
  });

  it('routes idle-capable workers through the heartbeat helper', () => {
    for (const path of [
      'supabase/functions/send-push/index.ts',
      'supabase/functions/process-push-receipts/index.ts',
      'supabase/functions/process-gameplay-queue/index.ts',
      'supabase/functions/rotate-dailys/index.ts',
      'supabase/functions/expire-pending-catches/index.ts',
    ]) {
      const source = read(path);
      assert.match(source, /completeOrHeartbeatBackendWorkerRun/, `${path} should import helper`);
      assert.match(
        source,
        /await completeOrHeartbeatBackendWorkerRun|: completeOrHeartbeatBackendWorkerRun/,
        `${path} should use helper`,
      );
    }
  });

  it('does not collapse trigger, manual, targeted, canary, partial, or failure records', () => {
    const helperSource = read('supabase/functions/_shared/backendWorkerRuns.ts');
    const sendPushSource = read('supabase/functions/send-push/index.ts');
    const queueSource = read('supabase/functions/process-gameplay-queue/index.ts');

    assert.match(helperSource, /handle\.source !== 'cron'/);
    assert.match(sendPushSource, /source: parseSource\(req, body\)/);
    assert.match(sendPushSource, /notification_id: notificationIdFromBody\(body\)/);
    assert.match(
      queueSource,
      /body\.canaryEventId[\s\S]*\? completeBackendWorkerRun[\s\S]*: completeOrHeartbeatBackendWorkerRun/,
    );

    for (const path of [
      'supabase/functions/send-push/index.ts',
      'supabase/functions/process-push-receipts/index.ts',
      'supabase/functions/process-gameplay-queue/index.ts',
      'supabase/functions/rotate-dailys/index.ts',
      'supabase/functions/expire-pending-catches/index.ts',
    ]) {
      const source = read(path);
      assert.match(
        source,
        /catch \(error\) \{[\s\S]*?await completeBackendWorkerRun/,
        `${path} should keep failures durable`,
      );
    }
  });
});
