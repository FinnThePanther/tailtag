const {
  withAppBuildGradle,
  withMainApplication,
  withProjectBuildGradle,
} = require('@expo/config-plugins');

const FIREBASE_COMMON_DEPENDENCY =
  "    implementation 'com.google.firebase:firebase-common:21.0.0'";
const FIREBASE_IMPORT = 'import com.google.firebase.FirebaseApp';
const FIREBASE_INIT = `    if (FirebaseApp.getApps(this).isEmpty()) {
      FirebaseApp.initializeApp(this)
    }`;
const GOOGLE_SERVICES_CLASSPATH = "        classpath 'com.google.gms:google-services:4.4.1'";
const GOOGLE_SERVICES_PLUGIN = "apply plugin: 'com.google.gms.google-services'";

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

function addGoogleServicesClasspath(contents) {
  if (contents.includes('com.google.gms:google-services')) {
    return contents;
  }

  return contents.replace(
    /(buildscript\s*\{[\s\S]*?dependencies\s*\{\n)/,
    `$1${GOOGLE_SERVICES_CLASSPATH}\n`,
  );
}

function addGoogleServicesPlugin(contents) {
  if (contents.includes('com.google.gms.google-services')) {
    return contents;
  }

  return `${contents.trimEnd()}\n\n${GOOGLE_SERVICES_PLUGIN}\n`;
}

module.exports = function withFirebaseAndroidInit(config) {
  config = withProjectBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      return modConfig;
    }

    modConfig.modResults.contents = addGoogleServicesClasspath(modConfig.modResults.contents);

    return modConfig;
  });

  config = withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      return modConfig;
    }

    modConfig.modResults.contents = addGoogleServicesPlugin(
      addFirebaseCommonDependency(modConfig.modResults.contents),
    );

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
