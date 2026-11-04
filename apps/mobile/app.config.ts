import type { ExpoConfig } from "expo/config";

// The API base URL is never hardcoded. Set EXPO_PUBLIC_API_URL (see README) for dev, EAS or release builds.
const config: ExpoConfig = {
  name: "Juniper",
  slug: "juniper",
  scheme: "juniper",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "com.evergreendigital.juniper",
    supportsTablet: false,
  },
  android: {
    package: "com.evergreendigital.juniper",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#1F3D36" },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    // Android notification color and the default channel name. The icon falls back to the app icon until a monochrome one is added.
    ["expo-notifications", { color: "#1F3D36", defaultChannel: "default" }],
    ["expo-splash-screen", { image: "./assets/splash-icon.png", backgroundColor: "#1F3D36", imageWidth: 160 }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? null,
    // The EAS project id the Expo push token needs. Never hardcoded: set EXPO_PUBLIC_EAS_PROJECT_ID (or EAS_PROJECT_ID).
    eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? process.env.EAS_PROJECT_ID ?? null },
  },
};

export default config;
