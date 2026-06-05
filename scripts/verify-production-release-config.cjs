#!/usr/bin/env node

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

process.env.APP_ENV = 'production';

const { getConfig } = require('@expo/config');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require('../package.json');
const easJson = require('../eas.json');

const expected = {
  appName: 'TailTag',
  iosBundleIdentifier: 'com.finnthepanther.tailtag',
  androidPackage: 'com.finnthepanther.tailtag',
  updateChannel: 'production',
  environment: 'production',
  supabaseUrl: 'https://dowtlhkzbxxmiflpswvd.supabase.co',
  androidServiceAccountKeyPath: './service-account-google-play-production.json',
  androidSubmitTrack: 'internal',
  iosAscAppId: '6757874759',
};

const failures = [];

function read(source, selector) {
  return selector.split('.').reduce((value, key) => value?.[key], source);
}

function assertEqual(label, actual, expectedValue) {
  if (actual !== expectedValue) {
    failures.push(
      `${label}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertFalse(label, actual) {
  if (actual !== false) {
    failures.push(`${label}: expected false, got ${JSON.stringify(actual)}`);
  }
}

function assertGitIgnored(relativePath) {
  try {
    execFileSync('git', ['check-ignore', '--quiet', '--', relativePath], {
      cwd: projectRoot,
      stdio: 'ignore',
    });
  } catch {
    failures.push(`${relativePath}: expected file path to be ignored by git`);
  }
}

const { exp } = getConfig(projectRoot, { skipSDKVersionRequirement: true });

assertEqual('Expo app name', exp.name, expected.appName);
assertEqual('Expo version', exp.version, packageJson.version);
assertEqual(
  'iOS bundle identifier',
  read(exp, 'ios.bundleIdentifier'),
  expected.iosBundleIdentifier,
);
assertEqual('Android package', read(exp, 'android.package'), expected.androidPackage);
assertEqual(
  'Update channel',
  read(exp, 'updates.requestHeaders.expo-channel-name'),
  expected.updateChannel,
);
assertEqual('Runtime environment', read(exp, 'extra.environment'), expected.environment);
assertEqual('Supabase URL', read(exp, 'extra.supabaseUrl'), expected.supabaseUrl);
assertFalse('Staff mode', read(exp, 'extra.staffModeEnabled'));

assertEqual(
  'Production build distribution',
  read(easJson, 'build.production.distribution'),
  'store',
);
assertEqual(
  'Production Android build type',
  read(easJson, 'build.production.android.buildType'),
  'app-bundle',
);
assertEqual(
  'Production EAS Supabase URL',
  read(easJson, 'build.production.env.EXPO_PUBLIC_SUPABASE_URL'),
  expected.supabaseUrl,
);
assertEqual(
  'iOS App Store Connect app id',
  read(easJson, 'submit.production.ios.ascAppId'),
  expected.iosAscAppId,
);
assertEqual(
  'Android service account path',
  read(easJson, 'submit.production.android.serviceAccountKeyPath'),
  expected.androidServiceAccountKeyPath,
);
assertEqual(
  'Android submit track',
  read(easJson, 'submit.production.android.track'),
  expected.androidSubmitTrack,
);
assertGitIgnored('service-account-google-play-production.json');

if (!fs.existsSync(path.join(projectRoot, 'google-services.production.json'))) {
  failures.push(
    'google-services.production.json: expected production Android Firebase config file to exist',
  );
}

if (failures.length > 0) {
  console.error('Production release config verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Production release config verification passed.');
console.log(`- App version: ${packageJson.version}`);
console.log(`- iOS bundle identifier: ${expected.iosBundleIdentifier}`);
console.log(`- Android package: ${expected.androidPackage}`);
console.log(`- Android submit track: ${expected.androidSubmitTrack}`);
