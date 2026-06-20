#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const migrationDir = path.join(projectRoot, 'supabase', 'migrations');

if (!fs.existsSync(migrationDir)) {
  console.log('No migrations directory found - skipping');
  process.exit(0);
}

const files = fs
  .readdirSync(migrationDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const errors = [];
const timestamps = new Map();

for (const file of files) {
  if (!/^[0-9]{14}_.+\.sql$/.test(file)) {
    errors.push(`Invalid migration filename: ${file} (expected: YYYYMMDDHHmmss_description.sql)`);
    continue;
  }

  const timestamp = file.slice(0, 14);
  const existing = timestamps.get(timestamp) ?? [];
  existing.push(file);
  timestamps.set(timestamp, existing);
}

for (const [timestamp, timestampFiles] of timestamps) {
  if (timestampFiles.length > 1) {
    errors.push(`Duplicate migration timestamp ${timestamp}: ${timestampFiles.join(', ')}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`ERROR: ${error}`);
  }
  process.exit(1);
}

console.log('All migration files are valid');
