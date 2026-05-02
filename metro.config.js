const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');

const config = getSentryExpoConfig(__dirname);

const escapePathForRegex = (filePath) => filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ignoredPaths = [
  'admin/.next',
  'admin/node_modules',
  'admin-v2/.svelte-kit',
  'admin-v2/build',
  'admin-v2/node_modules',
  'web/dist',
  'web/node_modules',
].map(
  (relativePath) => new RegExp(`^${escapePathForRegex(path.join(__dirname, relativePath))}\\/.*`),
);

const existingBlockList = config.resolver?.blockList
  ? Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  : [];

config.resolver = {
  ...config.resolver,
  blockList: [...existingBlockList, ...ignoredPaths],
  useWatchman: false,
};

module.exports = config;
