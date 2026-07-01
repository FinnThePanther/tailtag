#!/usr/bin/env node

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const functionsDir = path.join(projectRoot, 'supabase', 'functions');

if (!fs.existsSync(functionsDir)) {
  console.log('No Edge Functions directory found - skipping');
  process.exit(0);
}

const entrypoints = fs
  .readdirSync(functionsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => path.join('supabase', 'functions', entry.name, 'index.ts'))
  .filter((entrypoint) => fs.existsSync(path.join(projectRoot, entrypoint)))
  .sort();

if (entrypoints.length === 0) {
  console.log('No Edge Function entrypoints found - skipping');
  process.exit(0);
}

for (const entrypoint of entrypoints) {
  console.log(`Checking ${entrypoint}`);
  const configPath = path.join(projectRoot, path.dirname(entrypoint), 'deno.json');
  const args = fs.existsSync(configPath)
    ? ['check', '--config', configPath, entrypoint]
    : ['check', entrypoint];

  execFileSync('deno', args, {
    cwd: projectRoot,
    stdio: 'inherit',
  });
}

console.log(`Checked ${entrypoints.length} Edge Function entrypoints`);
