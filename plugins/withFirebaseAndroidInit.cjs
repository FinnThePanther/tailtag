const { withAppBuildGradle, withMainApplication } = require('@expo/config-plugins');

const FIREBASE_COMMON_DEPENDENCY =
  "    implementation 'com.google.firebase:firebase-common:21.0.0'";
const FIREBASE_IMPORT = 'import com.google.firebase.FirebaseApp';
const FIREBASE_INIT = `    if (FirebaseApp.getApps(this).isEmpty()) {
      FirebaseApp.initializeApp(this)
    }`;

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

module.exports = function withFirebaseAndroidInit(config) {
  config = withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      return modConfig;
    }

    modConfig.modResults.contents = addFirebaseCommonDependency(modConfig.modResults.contents);

    return modConfig;
  });

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
