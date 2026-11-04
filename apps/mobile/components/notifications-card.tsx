import { useCallback, useEffect, useState } from "react";
import {
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { ApiError, errorMessage } from "../lib/api";
import {
  askPermission,
  canUsePush,
  projectId,
  readPermission,
  registerThisPhone,
} from "../lib/notifications";
import {
  MISSING_PROJECT_ID_MESSAGE,
  settingRows,
  type PermissionView,
} from "../lib/push";
import { useMe, useSession } from "../lib/session";
import { fonts, space, useColors } from "../lib/theme";
import type { NotificationSettings } from "../lib/types";
import { Button, Card, ErrorBanner, NoticeBanner, Spinner, Text } from "./ui";

/** More > Notifications: what you will get, a button to turn them on, and a switch for each kind once they are on. */
export function NotificationsCard() {
  const me = useMe();
  const { api } = useSession();
  const c = useColors();
  const [view, setView] = useState<PermissionView | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const who = { workspaceId: me.workspace.id, membershipId: me.membershipId };
  const hasProject = projectId() !== null;

  const check = useCallback(async () => {
    if (!canUsePush) return;
    setView(await readPermission());
  }, []);

  useEffect(() => {
    void check();
    // Coming back from the system Settings app: look again.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void check();
    });
    return () => sub.remove();
  }, [check]);

  // The on/off choices live on the server so they follow the person between phones.
  useEffect(() => {
    let live = true;
    setSettings(null);
    api
      .notificationSettings()
      .then((s) => live && setSettings(s))
      .catch(
        (e) =>
          live &&
          !(e instanceof ApiError && e.code === "unauthorized") &&
          setError(errorMessage(e)),
      );
    return () => {
      live = false;
    };
  }, [api, me.workspace.id]);

  async function turnOn() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await askPermission();
      setView(next);
      if (next === "granted") {
        const res = await registerThisPhone(api, who, { force: true });
        if (res.ok) setNotice("Notifications are on for this phone.");
        else setError(res.message);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(key: keyof NotificationSettings, value: boolean) {
    if (!settings) return;
    const before = settings;
    setSettings({ ...settings, [key]: value });
    setError(null);
    try {
      setSettings(await api.setNotificationSettings({ [key]: value }));
    } catch (e) {
      setSettings(before);
      if (!(e instanceof ApiError && e.code === "unauthorized"))
        setError(errorMessage(e));
    }
  }

  const settingsHelp =
    Platform.OS === "ios"
      ? "open the Settings app, choose Juniper, then Notifications, and turn on Allow Notifications."
      : "open Settings, choose Apps, then Juniper, then Notifications, and turn them on.";

  return (
    <Card style={{ gap: space.sm }}>
      <Text muted>Notifications</Text>
      {!canUsePush ? (
        <Text>
          Notifications need a real phone. They do not work in a simulator.
        </Text>
      ) : !hasProject ? (
        <Text>{MISSING_PROJECT_ID_MESSAGE}</Text>
      ) : view === null ? (
        <Spinner />
      ) : view === "granted" ? (
        <View style={{ gap: space.md }}>
          <Text>
            Juniper will send a notification to this phone. Choose what you
            want.
          </Text>
          {settings ? (
            settingRows(me.workspace.vocab, me.role).map((row) => (
              <View key={row.key} style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: fonts.bodyMedium }}>
                    {row.label}
                  </Text>
                  <Text muted style={{ fontSize: 13 }}>
                    {row.hint}
                  </Text>
                </View>
                <Switch
                  accessibilityLabel={row.label}
                  value={settings[row.key]}
                  onValueChange={(v) => void toggle(row.key, v)}
                  trackColor={{ false: c.border, true: c.primary }}
                  thumbColor={Platform.OS === "android" ? c.surface : undefined}
                />
              </View>
            ))
          ) : (
            <Spinner />
          )}
        </View>
      ) : view === "denied" ? (
        <View style={{ gap: space.sm }}>
          <Text>
            Notifications are turned off for Juniper on this phone. To turn them
            on, {settingsHelp}
          </Text>
          <Button
            label="Open Settings"
            variant="secondary"
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          <Text>Get a notification when:</Text>
          {settingRows(me.workspace.vocab, me.role).map((row) => (
            <Text key={row.key} muted>
              {"•"} {row.label}
            </Text>
          ))}
          <Text muted>
            Only you get yours. Clients never get notifications from this app.
          </Text>
          <Button
            label="Turn on notifications"
            loading={busy}
            onPress={() => void turnOn()}
          />
        </View>
      )}
      {error ? <ErrorBanner message={error} /> : null}
      {notice ? <NoticeBanner message={notice} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
});
