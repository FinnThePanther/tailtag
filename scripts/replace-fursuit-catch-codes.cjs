#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const PRODUCTION_PROJECT_REF = 'dowtlhkzbxxmiflpswvd';
const PRODUCTION_SUPABASE_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const CODE_PATTERN = /^[A-Z0-9]{4,8}$/;

const OLD_CODE_HEADERS = new Set([
  'old code',
  'old catch code',
  'old fursuit code',
  'current code',
  'current catch code',
  'existing code',
  'existing catch code',
  'previous code',
  'previous catch code',
]);

const NEW_CODE_HEADERS = new Set([
  'new code',
  'new catch code',
  'new custom fursuit code',
  'new fursuit code',
  'replacement code',
  'replacement catch code',
  'requested code',
  'requested catch code',
]);

function printUsage() {
  console.log(`
Usage:
  node scripts/replace-fursuit-catch-codes.cjs --file ./catch-code-updates.csv [--execute]

Environment:
  SUPABASE_SERVICE_ROLE_KEY   Required. Production service-role key.
  SUPABASE_URL                Optional. Defaults to ${PRODUCTION_SUPABASE_URL}.

CSV requirements:
  Include a header row with old/new code columns. Recognized headers include
  "Old Fursuit Code", "New Custom Fursuit Code", "New Fursuit Code",
  "Old Code", "Old Catch Code", "Current Code", "New Code", and "New Catch Code".

Safety:
  Defaults to dry-run. Add --execute to update production.
`);
}

function parseArgs(argv) {
  const args = {
    execute: false,
    file: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--execute') {
      args.execute = true;
    } else if (arg === '--file') {
      args.file = argv[index + 1] ?? null;
      index += 1;
    } else if (arg.startsWith('--file=')) {
      args.file = arg.slice('--file='.length);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function normalizeHeader(header) {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);

  return rows.filter((candidate) => candidate.some((cell) => cell.trim() !== ''));
}

function findColumnIndex(headers, candidates) {
  const exactIndex = headers.findIndex((header) => candidates.has(header));
  if (exactIndex !== -1) {
    return exactIndex;
  }

  return headers.findIndex((header) => {
    const words = new Set(header.split(' '));

    if (!words.has('code')) {
      return false;
    }

    if (candidates === OLD_CODE_HEADERS) {
      return (
        words.has('old') || words.has('current') || words.has('existing') || words.has('previous')
      );
    }

    return words.has('new') || words.has('replacement') || words.has('requested');
  });
}

function readUpdates(filePath) {
  const csv = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(csv);

  if (rows.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }

  const headers = rows[0].map(normalizeHeader);
  const oldCodeIndex = findColumnIndex(headers, OLD_CODE_HEADERS);
  const newCodeIndex = findColumnIndex(headers, NEW_CODE_HEADERS);

  if (oldCodeIndex === -1 || newCodeIndex === -1) {
    throw new Error(
      `Could not find old/new code columns. Headers found: ${rows[0]
        .map((header) => `"${header}"`)
        .join(', ')}`,
    );
  }

  return rows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    oldCode: normalizeCode(row[oldCodeIndex]),
    newCode: normalizeCode(row[newCodeIndex]),
  }));
}

function validateUpdate(update) {
  if (!update.oldCode || !update.newCode) {
    return 'missing old or new code';
  }

  if (!CODE_PATTERN.test(update.oldCode)) {
    return `invalid old code "${update.oldCode}"`;
  }

  if (!CODE_PATTERN.test(update.newCode)) {
    return `invalid new code "${update.newCode}"`;
  }

  if (update.oldCode === update.newCode) {
    return 'old and new code are the same';
  }

  return null;
}

async function findFursuitByCode(supabase, code) {
  const { data, error } = await supabase
    .from('fursuits')
    .select('id,name,unique_code,is_tutorial')
    .eq('unique_code', code)
    .eq('is_tutorial', false)
    .maybeSingle();

  if (error) {
    throw new Error(`Lookup failed for ${code}: ${error.message}`);
  }

  return data;
}

async function updateFursuitCode(supabase, fursuitId, newCode) {
  const { error } = await supabase
    .from('fursuits')
    .update({ unique_code: newCode })
    .eq('id', fursuitId);

  if (error) {
    return error;
  }

  return null;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (!args.file) {
    throw new Error('Missing required --file argument.');
  }

  const inputPath = path.resolve(process.cwd(), args.file);
  const supabaseUrl = process.env.SUPABASE_URL || PRODUCTION_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
  }

  if (supabaseUrl !== PRODUCTION_SUPABASE_URL) {
    throw new Error(
      `Refusing to run against ${supabaseUrl}. Expected production URL ${PRODUCTION_SUPABASE_URL}.`,
    );
  }

  const updates = readUpdates(inputPath);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const results = {
    dryRun: 0,
    updated: 0,
    skipped: 0,
    conflicts: 0,
    invalid: 0,
  };

  console.log(
    `${args.execute ? 'Executing' : 'Dry-running'} ${updates.length} catch code updates.`,
  );

  for (const update of updates) {
    const validationError = validateUpdate(update);
    if (validationError) {
      results.invalid += 1;
      console.log(`Row ${update.rowNumber}: skipped (${validationError})`);
      continue;
    }

    const fursuit = await findFursuitByCode(supabase, update.oldCode);
    if (!fursuit) {
      results.skipped += 1;
      console.log(`Row ${update.rowNumber}: skipped (${update.oldCode} not found)`);
      continue;
    }

    const existingNewCode = await findFursuitByCode(supabase, update.newCode);
    if (existingNewCode) {
      results.conflicts += 1;
      console.log(
        `Row ${update.rowNumber}: skipped (${update.newCode} already belongs to "${existingNewCode.name}")`,
      );
      continue;
    }

    if (!args.execute) {
      results.dryRun += 1;
      console.log(
        `Row ${update.rowNumber}: would update "${fursuit.name}" ${update.oldCode} -> ${update.newCode}`,
      );
      continue;
    }

    const error = await updateFursuitCode(supabase, fursuit.id, update.newCode);
    if (error?.code === '23505') {
      results.conflicts += 1;
      console.log(`Row ${update.rowNumber}: skipped (${update.newCode} already exists)`);
      continue;
    }

    if (error) {
      throw new Error(
        `Row ${update.rowNumber}: update failed for ${update.oldCode}: ${error.message}`,
      );
    }

    results.updated += 1;
    console.log(
      `Row ${update.rowNumber}: updated "${fursuit.name}" ${update.oldCode} -> ${update.newCode}`,
    );
  }

  console.log('\nSummary');
  console.log(`  Updated: ${results.updated}`);
  console.log(`  Dry-run matches: ${results.dryRun}`);
  console.log(`  Missing old codes: ${results.skipped}`);
  console.log(`  New-code conflicts: ${results.conflicts}`);
  console.log(`  Invalid rows: ${results.invalid}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
