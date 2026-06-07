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
  supabaseUrl: 'https://api.playtailtag.com',
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

function assertFileIncludes(relativePath, expectedText, label) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return;
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  if (!content.includes(expectedText)) {
    failures.push(`${label}: expected ${relativePath} to include ${JSON.stringify(expectedText)}`);
  }
}

function assertFileExcludes(relativePath, unexpectedText, label) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return;
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  if (content.includes(unexpectedText)) {
    failures.push(
      `${label}: expected ${relativePath} not to include ${JSON.stringify(unexpectedText)}`,
    );
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

assertFileIncludes(
  'ios/TailTagDev.xcodeproj/project.pbxproj',
  `PRODUCT_BUNDLE_IDENTIFIER = ${expected.iosBundleIdentifier};`,
  'Native iOS bundle identifier',
);
assertFileExcludes(
  'ios/TailTagDev.xcodeproj/project.pbxproj',
  `${expected.iosBundleIdentifier}.dev`,
  'Native iOS bundle identifier',
);
assertFileExcludes(
  'ios/TailTagDev/Info.plist',
  `${expected.iosBundleIdentifier}.dev`,
  'Native iOS URL scheme',
);
assertFileIncludes(
  'ios/TailTagDev/Info.plist',
  `<string>${packageJson.version}</string>`,
  'Native iOS short version',
);
assertFileIncludes(
  'android/app/build.gradle',
  `versionName "${packageJson.version}"`,
  'Native Android version name',
);
assertFileIncludes(
  'android/app/src/main/res/values/strings.xml',
  `<string name="expo_runtime_version">${packageJson.version}</string>`,
  'Native Android runtime version',
);
assertFileIncludes(
  'android/app/src/main/java/com/finnthepanther/tailtag/MainActivity.kt',
  `package ${expected.androidPackage}`,
  'Native Android MainActivity package',
);
assertFileIncludes(
  'android/app/src/main/java/com/finnthepanther/tailtag/MainApplication.kt',
  `package ${expected.androidPackage}`,
  'Native Android MainApplication package',
);

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
