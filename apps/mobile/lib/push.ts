// Pure push notification rules. Plain TypeScript (no react-native imports) so they can be unit tested.
import { isManager } from "@evergreen/core";
import type { Role, TodayScope, Vocabulary } from "./types";

export type Platform = "ios" | "android";

/** Body of POST /devices. */
export interface DeviceRegistration {
  token: string;
  platform: Platform;
}

const TOKEN_RE = /^Expo(nent)?PushToken\[[^\]\s]{8,200}\]$/;

export function isExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token.trim());
}

/** What to send when registering this phone, or null when the token or platform is not usable. */
export function registrationPayload(
  token: unknown,
  platform: string,
): DeviceRegistration | null {
  if (!isExpoPushToken(token)) return null;
  if (platform !== "ios" && platform !== "android") return null;
  return { token: token.trim(), platform };
}

/** What was last registered with the server, to skip a repeat call. */
export interface Registered {
  token: string;
  workspaceId: string;
  membershipId: string;
}

/** Register again when the token, the business or the person changed, or nothing was registered yet. */
export function needsRegistration(
  prev: Registered | null,
  next: Registered,
): boolean {
  if (!prev) return true;
  return (
    prev.token !== next.token ||
    prev.workspaceId !== next.workspaceId ||
    prev.membershipId !== next.membershipId
  );
}

/**
 * The EAS project id the Expo push token needs. Comes from config (`extra.eas.projectId`, which reads an env var
 * in app.config.ts) or from the EAS build config. Never hardcoded. Null when missing.
 */
export function resolveProjectId(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export const MISSING_PROJECT_ID_MESSAGE =
  "Notifications are not set up in this build yet. The app needs its Expo project id (EXPO_PUBLIC_EAS_PROJECT_ID). Ask whoever builds the app to add it.";

export type PermissionStatus = "granted" | "denied" | "undetermined";
export type PermissionView = "granted" | "can-ask" | "denied";

/** Granted, still askable (never asked, or the system will show the prompt again), or denied (only Settings can change it). */
export function permissionView(
  status: PermissionStatus,
  canAskAgain: boolean,
): PermissionView {
  if (status === "granted") return "granted";
  if (status === "undetermined") return "can-ask";
  return canAskAgain ? "can-ask" : "denied";
}

// ---------- Notification data ----------

export type PushData =
  | {
      type: "booking";
      appointmentId: string;
      membershipId: string | null;
      workspaceId: string | null;
      event: string | null;
    }
  | {
      type: "time_off";
      timeOffId: string;
      workspaceId: string | null;
      event: string | null;
    };

const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

/** Reads the `data` of a notification. Anything unexpected is null (the tap then does nothing). */
export function parsePushData(raw: unknown): PushData | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.type === "booking") {
    const appointmentId = str(d.appointmentId);
    return appointmentId
      ? {
          type: "booking",
          appointmentId,
          membershipId: str(d.membershipId),
          workspaceId: str(d.workspaceId),
          event: str(d.event),
        }
      : null;
  }
  if (d.type === "time_off") {
    const timeOffId = str(d.timeOffId);
    return timeOffId
      ? {
          type: "time_off",
          timeOffId,
          workspaceId: str(d.workspaceId),
          event: str(d.event),
        }
      : null;
  }
  return null;
}

export interface Viewer {
  workspaceId: string;
  membershipId: string;
  /** Every business this person is on. */
  workspaceIds: string[];
}

export type Destination =
  | { screen: "today"; scope: TodayScope; switchTo: string | null }
  | { screen: "time-off"; switchTo: string | null }
  | { screen: "none" };

/**
 * Where a tap goes. A booking opens Today, with scope All when it is another person's. A time off notification
 * opens Time off. If it belongs to another business the person is on, `switchTo` says which to switch to first.
 * A business the person is no longer on goes nowhere.
 */
export function destinationFor(
  data: PushData | null,
  viewer: Viewer,
): Destination {
  if (!data) return { screen: "none" };
  let switchTo: string | null = null;
  if (data.workspaceId && data.workspaceId !== viewer.workspaceId) {
    if (!viewer.workspaceIds.includes(data.workspaceId))
      return { screen: "none" };
    switchTo = data.workspaceId;
  }
  if (data.type === "time_off") return { screen: "time-off", switchTo };
  // After a switch we do not know the person's id in that business, so show everyone.
  const mine = switchTo === null && data.membershipId === viewer.membershipId;
  return { screen: "today", scope: mine ? "mine" : "all", switchTo };
}

/** Which screen to refresh when a notification arrives while the app is open. */
export function refreshTopic(
  data: PushData | null,
): "today" | "time-off" | null {
  if (!data) return null;
  return data.type === "booking" ? "today" : "time-off";
}

// ---------- Settings text ----------

export interface SettingRow {
  key: "bookings" | "timeOff";
  label: string;
  hint: string;
}

/** Rows for the More screen. Words come from the business vocabulary; managers also get time off requests. */
export function settingRows(vocab: Vocabulary, role: Role): SettingRow[] {
  const appts = vocab.appointmentPlural.toLowerCase();
  return [
    {
      key: "bookings",
      label: `New and cancelled ${appts}`,
      hint: `When a ${vocab.client.toLowerCase()} books or cancels online with you, or with anyone if you manage the business.`,
    },
    isManager(role)
      ? {
          key: "timeOff",
          label: "Time off requests and decisions",
          hint: "When someone asks for time off, and when your own request is approved or denied.",
        }
      : {
          key: "timeOff",
          label: "Time off decisions",
          hint: "When your time off request is approved or denied.",
        },
  ];
}
