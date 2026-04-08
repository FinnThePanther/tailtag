#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  envConfigs,
  resolveAppEnv,
} = require('./native-env.config.cjs');

const repoRoot = path.resolve(__dirname, '..');
const requestedEnv = process.env.APP_ENV ?? process.argv[2] ?? 'development';
const appEnv = resolveAppEnv(requestedEnv);
const config = envConfigs[appEnv];

function readFileIfExists(relativePath) {
  const filePath = path.join(repoRoot, relativePath);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, 'utf8');
}

function writeFile(relativePath, contents) {
  const filePath = path.join(repoRoot, relativePath);
  fs.writeFileSync(filePath, contents);
}

function replaceRequired(contents, relativePath, replacements) {
  let next = contents;

  for (const replacement of replacements) {
    const matches = next.match(replacement.pattern);

    if (!matches) {
      throw new Error(
        `Could not find ${replacement.label} in ${relativePath}.`
      );
    }

    next = next.replace(replacement.pattern, replacement.value);
  }

  return next;
}

function syncTextFile(relativePath, replacements) {
  const current = readFileIfExists(relativePath);

  if (current === null) {
    return false;
  }

  const next = replaceRequired(current, relativePath, replacements);

  if (next === current) {
    return false;
  }

  writeFile(relativePath, next);
  return true;
}

function syncOptionalCopy(sourceRelativePath, destinationRelativePath) {
  const sourcePath = path.join(repoRoot, sourceRelativePath);

  if (!fs.existsSync(sourcePath)) {
    return false;
  }

  const destinationPath = path.join(repoRoot, destinationRelativePath);
  const sourceContents = fs.readFileSync(sourcePath);
  const destinationContents = fs.existsSync(destinationPath)
    ? fs.readFileSync(destinationPath)
    : null;

  if (destinationContents && sourceContents.equals(destinationContents)) {
    return false;
  }

  fs.copyFileSync(sourcePath, destinationPath);
  return true;
}

const changedFiles = [];

if (
  syncTextFile('android/app/build.gradle', [
    {
      label: 'Android namespace',
      pattern: /namespace\s+'[^']+'/,
      value: `namespace '${config.androidApplicationId}'`,
    },
    {
      label: 'Android applicationId',
      pattern: /applicationId\s+'[^']+'/,
      value: `applicationId '${config.androidApplicationId}'`,
    },
  ])
) {
  changedFiles.push('android/app/build.gradle');
}

if (
  syncTextFile('android/app/src/main/res/values/strings.xml', [
    {
      label: 'Android app name',
      pattern: /<string name="app_name">[^<]+<\/string>/,
      value: `<string name="app_name">${config.appDisplayName}</string>`,
    },
  ])
) {
  changedFiles.push('android/app/src/main/res/values/strings.xml');
}

if (
  syncTextFile('android/settings.gradle', [
    {
      label: 'Android root project name',
      pattern: /rootProject\.name = '[^']+'/,
      value: `rootProject.name = '${config.appDisplayName}'`,
    },
  ])
) {
  changedFiles.push('android/settings.gradle');
}

if (
  syncTextFile('android/app/src/main/java/com/finnthepanther/tailtag/staging/MainActivity.kt', [
    {
      label: 'Android MainActivity package',
      pattern: /^package\s+com\.finnthepanther\.tailtag(?:\.dev|\.staging)?$/m,
      value: `package ${config.androidApplicationId}`,
    },
  ])
) {
  changedFiles.push(
    'android/app/src/main/java/com/finnthepanther/tailtag/staging/MainActivity.kt'
  );
}

if (
  syncTextFile('android/app/src/main/java/com/finnthepanther/tailtag/staging/MainApplication.kt', [
    {
      label: 'Android MainApplication package',
      pattern: /^package\s+com\.finnthepanther\.tailtag(?:\.dev|\.staging)?$/m,
      value: `package ${config.androidApplicationId}`,
    },
  ])
) {
  changedFiles.push(
    'android/app/src/main/java/com/finnthepanther/tailtag/staging/MainApplication.kt'
  );
}

if (
  syncTextFile('ios/TailTagStaging/Info.plist', [
    {
      label: 'iOS display name',
      pattern: /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]+(<\/string>)/,
      value: `$1${config.appDisplayName}$2`,
    },
    {
      label: 'iOS URL scheme bundle identifier',
      pattern: /<string>com\.finnthepanther\.tailtag(?:\.dev|\.staging)?<\/string>/,
      value: `<string>${config.iosBundleId}</string>`,
    },
  ])
) {
  changedFiles.push('ios/TailTagStaging/Info.plist');
}

if (
  syncTextFile('ios/TailTagStaging.xcodeproj/project.pbxproj', [
    {
      label: 'iOS PRODUCT_BUNDLE_IDENTIFIER',
      pattern: /PRODUCT_BUNDLE_IDENTIFIER = com\.finnthepanther\.tailtag(?:\.dev|\.staging)?;/g,
      value: `PRODUCT_BUNDLE_IDENTIFIER = ${config.iosBundleId};`,
    },
  ])
) {
  changedFiles.push('ios/TailTagStaging.xcodeproj/project.pbxproj');
}

const syncedGoogleServicesTargets = [];

if (syncOptionalCopy(config.googleServicesFile, 'google-services.json')) {
  syncedGoogleServicesTargets.push('google-services.json');
}

if (
  syncOptionalCopy(config.googleServicesFile, 'android/app/google-services.json')
) {
  syncedGoogleServicesTargets.push('android/app/google-services.json');
}

if (syncedGoogleServicesTargets.length > 0) {
  changedFiles.push(...syncedGoogleServicesTargets);
} else if (
  appEnv !== 'production' &&
  !fs.existsSync(path.join(repoRoot, config.googleServicesFile))
) {
  console.warn(
    `[sync-native-env] ${config.googleServicesFile} not found. Android ${appEnv} builds will need an environment-specific Firebase config before push-enabled builds can succeed.`
  );
}

if (
  syncOptionalCopy(config.iosGoogleServicesFile, 'GoogleService-Info.plist')
) {
  changedFiles.push('GoogleService-Info.plist');
}

if (changedFiles.length === 0) {
  console.log(`[sync-native-env] ${appEnv}: native config already in sync`);
  process.exit(0);
}

console.log(
  `[sync-native-env] ${appEnv}: updated ${changedFiles.join(', ')}`
);
