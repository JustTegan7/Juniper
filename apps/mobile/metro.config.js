// Expo configures Metro for npm workspaces (watch folders, hoisted node_modules) on its own.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
