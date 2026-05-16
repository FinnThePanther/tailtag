#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const allowedBranches = new Set(['main']);
const watchedPaths = ['admin/'];

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

  const diff = execFileSync('git', ['diff', '--name-only', 'HEAD^', 'HEAD'], {
    encoding: 'utf8',
  });

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
