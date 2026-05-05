#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');

const baseSha = process.argv[2] || process.env.BASE_SHA || process.env.BEFORE_SHA;

if (!baseSha) {
  console.error('Usage: node scripts/check-native-dependency-changes.cjs <base-sha>');
  process.exit(2);
}

if (/^0{40}$/.test(baseSha)) {
  console.log('Initial push to branch - skipping native dependency guard.');
  process.exit(0);
}

const baseExists = spawnSync('git', ['cat-file', '-e', `${baseSha}^{commit}`], {
  stdio: 'ignore',
});

if (baseExists.status !== 0) {
  console.warn(
    `::warning::Base commit ${baseSha} is not available in this checkout; skipping native dependency guard.`,
  );
  console.warn('This can happen after a force-push that rewrites branch history.');
  process.exit(0);
}

const hasDiff = (paths) => {
  const result = spawnSync('git', ['diff', '--quiet', baseSha, 'HEAD', '--', ...paths], {
    stdio: 'inherit',
  });

  if (result.status === 0) {
    return false;
  }

  if (result.status === 1) {
    return true;
  }

  process.exit(result.status ?? 1);
};

if (!hasDiff(['package.json'])) {
  console.log('package.json did not change.');
  process.exit(0);
}

if (hasDiff(['ios', 'android', 'app.config.ts', 'eas.json'])) {
  console.log('Native/runtime files changed; native dependency changes are allowed.');
  process.exit(0);
}

const before = JSON.parse(
  execFileSync('git', ['show', `${baseSha}:package.json`], {
    encoding: 'utf8',
  }),
);
const after = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const sections = ['dependencies', 'devDependencies', 'optionalDependencies'];
const nativePackagePattern = /^(expo($|-)|@expo\/|react-native($|-)|@react-native\/)/;

const changed = [];
for (const section of sections) {
  const beforeDeps = before[section] ?? {};
  const afterDeps = after[section] ?? {};
  const names = new Set([...Object.keys(beforeDeps), ...Object.keys(afterDeps)]);

  for (const name of names) {
    if (beforeDeps[name] !== afterDeps[name] && nativePackagePattern.test(name)) {
      changed.push(`${name} (${section})`);
    }
  }
}

if (changed.length === 0) {
  console.log('No native-looking dependency changes detected.');
  process.exit(0);
}

console.error('Native-looking dependency changes require native project changes:');
for (const name of changed) {
  console.error(`  - ${name}`);
}
console.error('');
console.error(
  'Run expo prebuild for the affected environment and commit the resulting ios/ or android/ changes,',
);
console.error('or use an EAS skip directive for an intentional exception.');
process.exit(1);
