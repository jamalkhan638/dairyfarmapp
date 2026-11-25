// Default Expo config (monorepo aware).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Web preview only (screenshots): expo-sqlite's web version needs .wasm files.
// The Android build never sets DAIRY_WEB_PREVIEW.
if (process.env.DAIRY_WEB_PREVIEW) config.resolver.assetExts.push('wasm');

module.exports = config;
