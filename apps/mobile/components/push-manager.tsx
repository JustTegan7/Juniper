import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import {
  configureForegroundBehavior,
  ensureChannel,
  onTokenChanged,
  registerThisPhone,
} from "../lib/notifications";
import { destinationFor, parsePushData, refreshTopic } from "../lib/push";
import { publish } from "../lib/refresh-bus";
import { useMe, useSession } from "../lib/session";

configureForegroundBehavior();

/**
 * Renders nothing. While someone is signed in with a business chosen it:
 * - registers this phone for pushes (only if the person already allowed them), again after a business switch or a new token;
 * - refreshes the affected screen when a notification arrives while the app is open;
 * - opens the right place when a notification is tapped (also when it launched the app).
 */
export function PushManager() {
  const me = useMe();
  const { api, chooseBusiness } = useSession();
  const workspaceId = me.workspace.id;
  const membershipId = me.membershipId;
  const workspaceIds = me.workspaces.map((w) => w.id);
  const viewerRef = useRef({ workspaceId, membershipId, workspaceIds });
  viewerRef.current = { workspaceId, membershipId, workspaceIds };

  // Register after sign in and after switching business. Needs permission already granted; asking happens in More.
  useEffect(() => {
    void ensureChannel();
    void registerThisPhone(api, { workspaceId, membershipId });
  }, [api, workspaceId, membershipId]);

  // Register again when the system issues a new token.
  useEffect(
    () =>
      onTokenChanged(
        () => void registerThisPhone(api, viewerRef.current, { force: true }),
      ),
    [api],
  );

  // Open app: refresh the screen the notification is about. The banner itself comes from the foreground handler.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const topic = refreshTopic(parsePushData(n.request.content.data));
      if (topic) publish(topic);
    });
    return () => sub.remove();
  }, []);

  // Taps, including the one that launched the app. Each response is handled once.
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (
      !response ||
      response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
    )
      return;
    const key = `${response.notification.request.identifier}:${response.notification.date}`;
    if (handled.current === key) return;
    handled.current = key;
    const data = parsePushData(response.notification.request.content.data);
    const dest = destinationFor(data, viewerRef.current);
    if (dest.screen === "none") return;
    void (async () => {
      if (dest.switchTo) {
        const err = await chooseBusiness(dest.switchTo);
        if (err) return;
      }
      if (dest.screen === "today") {
        // The Today tab reads these params; "t" changes on every tap so the same scope applies again.
        router.navigate({
          pathname: "/",
          params: { scope: dest.scope, t: String(Date.now()) },
        });
        publish("today");
      } else {
        router.navigate("/time-off");
        publish("time-off");
      }
    })();
  }, [response, chooseBusiness]);

  return null;
}
