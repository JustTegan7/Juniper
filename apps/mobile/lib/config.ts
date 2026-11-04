import Constants from "expo-constants";

/** API base URL from EXPO_PUBLIC_API_URL (inlined at bundle time) or the Expo config `extra.apiUrl`. Never hardcoded. */
export function getApiUrl(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const fromConfig = (Constants.expoConfig?.extra as { apiUrl?: string | null } | undefined)?.apiUrl;
  const url = (fromEnv || fromConfig || "").trim().replace(/\/+$/, "");
  return url || null;
}
