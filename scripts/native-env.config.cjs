const envConfigs = {
  development: {
    appDisplayName: 'TailTag (Dev)',
    iosBundleId: 'com.finnthepanther.tailtag.dev',
    androidApplicationId: 'com.finnthepanther.tailtag.dev',
    googleServicesFile: 'google-services.development.json',
    iosGoogleServicesFile: 'GoogleService-Info.development.plist',
  },
  staging: {
    appDisplayName: 'TailTag (Staging)',
    iosBundleId: 'com.finnthepanther.tailtag.staging',
    androidApplicationId: 'com.finnthepanther.tailtag.staging',
    googleServicesFile: 'google-services.staging.json',
    iosGoogleServicesFile: 'GoogleService-Info.staging.plist',
  },
  production: {
    appDisplayName: 'TailTag',
    iosBundleId: 'com.finnthepanther.tailtag',
    androidApplicationId: 'com.finnthepanther.tailtag',
    googleServicesFile: 'google-services.production.json',
    iosGoogleServicesFile: 'GoogleService-Info.production.plist',
  },
};

function resolveAppEnv(input) {
  if (typeof input === 'string' && Object.hasOwn(envConfigs, input)) {
    return input;
  }

  return 'development';
}

module.exports = {
  envConfigs,
  resolveAppEnv,
};
