// The native side of push: permission, token, channel and the foreground handler. Pure rules live in lib/push.ts (tested).
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Api } from "./api";
import {
  MISSING_PROJECT_ID_MESSAGE,
  needsRegistration,
  permissionView,
  registrationPayload,
  resolveProjectId,
  type PermissionView,
  type Registered,
} from "./push";
import { getPushToken, setPushToken } from "./storage";

export const CHANNEL_ID = "default";

/** Foreground: show a banner and play the sound. No badge counts. Call once at startup. */
export function configureForegroundBehavior() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Android needs a channel before any notification can show. Safe to call more than once. */
export async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Bookings and time off",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#1F3D36",
  });
}

export function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as
    { eas?: { projectId?: string | null } } | undefined;
  return resolveProjectId(
    extra?.eas?.projectId,
    Constants.easConfig?.projectId,
  );
}

/** Push needs a real phone (simulators cannot get a token). */
export const canUsePush = Device.isDevice;

export async function readPermission(): Promise<PermissionView> {
  const p = await Notifications.getPermissionsAsync();
  return permissionView(p.status, p.canAskAgain);
}

/** Shows the system prompt (only when it can). Call from a button, never on launch. */
export async function askPermission(): Promise<PermissionView> {
  await ensureChannel(); // Android 13+ asks only once a channel exists.
  const p = await Notifications.requestPermissionsAsync();
  return permissionView(p.status, p.canAskAgain);
}

let lastRegistered: Registered | null = null;
let inFlight: Promise<RegisterResult> | null = null;

export type RegisterResult = { ok: true } | { ok: false; message: string };

/**
 * Gets this phone's Expo push token and registers it for the active business. Skips the call when nothing changed.
 * Does not ask for permission: if it was not granted, it does nothing.
 */
export function registerThisPhone(
  api: Api,
  who: { workspaceId: string; membershipId: string },
  opts: { force?: boolean } = {},
): Promise<RegisterResult> {
  if (inFlight) return inFlight;
  inFlight = doRegister(api, who, opts.force ?? false).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRegister(
  api: Api,
  who: { workspaceId: string; membershipId: string },
  force: boolean,
): Promise<RegisterResult> {
  if (!canUsePush)
    return {
      ok: false,
      message:
        "Notifications need a real phone. They do not work in a simulator.",
    };
  if ((await readPermission()) !== "granted")
    return {
      ok: false,
      message: "Notifications are not turned on for this phone.",
    };
  const id = projectId();
  if (!id) return { ok: false, message: MISSING_PROJECT_ID_MESSAGE };
  try {
    await ensureChannel();
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: id,
    });
    const payload = registrationPayload(token, Platform.OS);
    if (!payload)
      return {
        ok: false,
        message: "This phone did not give a usable notification token.",
      };
    const next: Registered = { token: payload.token, ...who };
    if (!force && !needsRegistration(lastRegistered, next)) return { ok: true };
    await api.registerDevice(payload);
    lastRegistered = next;
    await setPushToken(payload.token);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error && e.message
          ? e.message
          : "Could not turn on notifications. Try again.",
    };
  }
}

/** Called when the system hands out a new token. */
export function onTokenChanged(listener: () => void) {
  const sub = Notifications.addPushTokenListener(() => listener());
  return () => sub.remove();
}

/** Sign out: tell the server to stop pushing to this phone. Best effort; never blocks sign out for long. */
export async function unregisterThisPhone(api: Api): Promise<void> {
  lastRegistered = null;
  try {
    const token = await getPushToken();
    if (!token) return;
    await Promise.race([
      api.removeDevice(token),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    await setPushToken(null);
  } catch {
    // Offline or already signed out. The server also drops the token when the next person registers this phone.
  }
}
