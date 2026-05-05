const fs = require('fs');
const path = require('path');

const {
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

const FIREBASE_COMMON_DEPENDENCY =
  "    implementation 'com.google.firebase:firebase-common:21.0.0'";
const FIREBASE_IMPORT = 'import com.google.firebase.FirebaseApp';
const FIREBASE_INIT = `    if (FirebaseApp.getApps(this).isEmpty()) {
      FirebaseApp.initializeApp(this)
    }`;
const FIREBASE_CONFIGS_BY_PACKAGE = {
  'com.finnthepanther.tailtag': {
    mobilesdk_app_id: '1:289951778626:android:6f0ecfa7dde77d51db2adb',
  },
  'com.finnthepanther.tailtag.dev': {
    mobilesdk_app_id: '1:289951778626:android:b211ca8050e29e11db2adb',
  },
  'com.finnthepanther.tailtag.staging': {
    mobilesdk_app_id: '1:289951778626:android:760de28d9b0fa201db2adb',
  },
};
const SHARED_FIREBASE_CONFIG = {
  project_id: 'tailtag-79400',
  project_number: '289951778626',
  storage_bucket: 'tailtag-79400.firebasestorage.app',
  api_key: 'AIzaSyCtYoFO6aEHkrattvIgcS2vtmoEkIJ83OE',
};

function addFirebaseImport(contents) {
  if (contents.includes(FIREBASE_IMPORT)) {
    return contents;
  }

  return contents.replace(
    'import com.facebook.react.defaults.DefaultReactNativeHost',
    `import com.facebook.react.defaults.DefaultReactNativeHost
${FIREBASE_IMPORT}`,
  );
}

function addFirebaseInitialization(contents) {
  if (contents.includes('FirebaseApp.initializeApp(this)')) {
    return contents;
  }

  return contents.replace(
    /(\s+override fun onCreate\(\) \{\n\s+super\.onCreate\(\)\n)/,
    `$1${FIREBASE_INIT}
`,
  );
}

function addFirebaseCommonDependency(contents) {
  if (contents.includes('com.google.firebase:firebase-common')) {
    return contents;
  }

  return contents.replace(/(dependencies\s*\{\n)/, `$1${FIREBASE_COMMON_DEPENDENCY}\n`);
}

function createGoogleServicesConfig(packageName) {
  const appConfig = FIREBASE_CONFIGS_BY_PACKAGE[packageName];
  if (!appConfig) {
    throw new Error(`Missing Android Firebase config for package ${packageName ?? '(unknown)'}.`);
  }

  return {
    project_info: {
      project_number: SHARED_FIREBASE_CONFIG.project_number,
      project_id: SHARED_FIREBASE_CONFIG.project_id,
      storage_bucket: SHARED_FIREBASE_CONFIG.storage_bucket,
    },
    client: [
      {
        client_info: {
          mobilesdk_app_id: appConfig.mobilesdk_app_id,
          android_client_info: {
            package_name: packageName,
          },
        },
        oauth_client: [],
        api_key: [
          {
            current_key: SHARED_FIREBASE_CONFIG.api_key,
          },
        ],
        services: {
          appinvite_service: {
            other_platform_oauth_client: [],
          },
        },
      },
    ],
    configuration_version: '1',
  };
}

function ensureGoogleServicesFile(config, modConfig) {
  if (config.android?.googleServicesFile) {
    return modConfig;
  }

  const packageName = config.android?.package;
  const googleServicesPath = path.join(
    modConfig.modRequest.platformProjectRoot,
    'app',
    'google-services.json',
  );
  const googleServicesConfig = createGoogleServicesConfig(packageName);

  fs.writeFileSync(googleServicesPath, `${JSON.stringify(googleServicesConfig, null, 2)}\n`);

  return modConfig;
}

module.exports = function withFirebaseAndroidInit(config) {
  config = withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      return modConfig;
    }

    modConfig.modResults.contents = addFirebaseCommonDependency(modConfig.modResults.contents);

    return modConfig;
  });

  config = withDangerousMod(config, [
    'android',
    (modConfig) => ensureGoogleServicesFile(config, modConfig),
  ]);

  return withMainApplication(config, (modConfig) => {
    if (modConfig.modResults.language !== 'kt') {
      return modConfig;
    }

    modConfig.modResults.contents = addFirebaseInitialization(
      addFirebaseImport(modConfig.modResults.contents),
    );

    return modConfig;
  });
};
