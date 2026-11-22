// Lets the app import from /contracts (macros.ts, fixtures), which sits outside /app.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../contracts')];
module.exports = config;
