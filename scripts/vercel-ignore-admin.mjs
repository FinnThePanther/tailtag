#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const allowedBranches = new Set(parseList(process.env.ALLOWED_BRANCHES, ['main']));
const watchedPaths = parseList(process.env.WATCHED_PATHS, ['admin/']);

function parseList(value, fallback) {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.length > 0 ? entries : fallback;
}

function log(message) {
  console.log(`[vercel-ignore-admin] ${message}`);
}

function hasChangedFiles() {
  try {
    execFileSync('git', ['rev-parse', '--verify', 'HEAD^'], { stdio: 'ignore' });
  } catch {
    log('No parent commit available; allowing deployment.');
    return true;
  }

  let diff = '';
  try {
    diff = execFileSync('git', ['diff', '--name-only', 'HEAD^', 'HEAD'], {
      encoding: 'utf8',
    });
  } catch (error) {
    console.error('[vercel-ignore-admin] Failed to inspect changed files.', error);
  }

  return diff
    .split('\n')
    .filter(Boolean)
    .some((file) => watchedPaths.some((path) => file.startsWith(path)));
}

const branch = process.env.VERCEL_GIT_COMMIT_REF ?? '';

if (!allowedBranches.has(branch)) {
  log(`Skipping deployment for branch "${branch || 'unknown'}".`);
  process.exit(0);
}

if (!hasChangedFiles()) {
  log('Skipping deployment because admin files did not change.');
  process.exit(0);
}

log('Admin files changed on an allowed branch; building deployment.');
process.exit(1);
