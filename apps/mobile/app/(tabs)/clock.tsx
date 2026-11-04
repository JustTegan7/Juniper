import { useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { formatTimeIn } from "@evergreen/core";
import { Button, Card, Centered, ErrorBanner, Heading, NoticeBanner, Screen, Spinner, Text } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { breakLabel, breakLength, clockButtons, elapsedTimer } from "../../lib/format";
import { useMe, useSession } from "../../lib/session";
import { fonts, space, useColors } from "../../lib/theme";
import type { BreakKind, ClockActionResponse } from "../../lib/types";
import { useLoad } from "../../lib/use-load";
import { useNotice } from "../../lib/use-notice";
import { useTicker } from "../../lib/use-ticker";

type Action = "in" | "out" | "meal" | "rest" | "end";

export default function Clock() {
  const me = useMe();
  const { api } = useSession();
  const c = useColors();
  const tz = me.workspace.timezone;
  const { data, error, loading, refreshing, reload, sync, pull, setData } = useLoad(() => api.clock(), [api, me.workspace.id]);
  const notice = useNotice();
  const [busy, setBusy] = useState<Action | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Ticks once a second while someone is clocked in and this tab is in front. Stops otherwise.
  const now = useTicker(Boolean(data?.clockedIn));

  /** Runs one write. The answer carries the new clock status, so the screen updates without another request. */
  async function act(action: Action, call: () => Promise<ClockActionResponse>) {
    if (busy) return;
    setBusy(action);
    setActionError(null);
    notice.clear();
    try {
      const res = await call();
      setData(res.clock);
      notice.show(res.message);
    } catch (e) {
      if (e instanceof ApiError && e.code === "unauthorized") return;
      setActionError(errorMessage(e));
      // The screen was out of step with the server (for example already clocked in on another phone). Match it.
      if (e instanceof ApiError && (e.status === 400 || e.status === 409)) await sync();
    } finally {
      setBusy(null);
    }
  }

  function confirmClockOut() {
    Alert.alert("Clock out?", "This ends your shift.", [
      { text: "Stay clocked in", style: "cancel" },
      { text: "Clock out", style: "destructive", onPress: () => void act("out", () => api.clockOut()) },
    ]);
  }

  const at = (iso: string) => formatTimeIn(new Date(iso), tz);
  const startBreak = (kind: BreakKind) => void act(kind, () => api.startBreak(kind));
  const buttons = data ? clockButtons(data, me.workspace.trackRestBreaks) : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pull()} tintColor={c.primary} />}>
        <Heading size={30}>Clock</Heading>
        {notice.message ? <NoticeBanner message={notice.message} /> : null}
        {error ? <ErrorBanner message={error} /> : null}
        {actionError ? <ErrorBanner message={actionError} /> : null}
        {loading && !data ? (
          <Centered>
            <Spinner />
          </Centered>
        ) : data && buttons ? (
          <>
            <Card style={{ gap: space.xs }}>
              <Text muted>{data.clockedIn ? "Clocked in" : "Not clocked in"}</Text>
              {data.entry ? (
                <>
                  <Text accessibilityLabel={`Time clocked in ${elapsedTimer(data.entry.clockIn, now)}`} style={[styles.timer, { color: c.fg }]}>
                    {elapsedTimer(data.entry.clockIn, now)}
                  </Text>
                  <Text muted>Since {at(data.entry.clockIn)}</Text>
                </>
              ) : (
                <Text muted>Clock in to start your shift.</Text>
              )}
            </Card>

            {data.openBreak ? (
              <Card style={{ gap: space.xs, borderColor: c.today }}>
                <Text style={{ fontFamily: fonts.bodyMedium, color: c.today }}>{breakLabel(data.openBreak.kind)} in progress</Text>
                <Text style={[styles.breakTimer, { color: c.fg }]}>{breakLength(data.openBreak, now)}</Text>
                <Text muted>Started {at(data.openBreak.startsAt)}</Text>
              </Card>
            ) : null}

            <View style={styles.buttons}>
              {buttons.clockIn ? <Button label="Clock in" loading={busy === "in"} disabled={busy !== null} onPress={() => void act("in", () => api.clockIn())} /> : null}
              {buttons.endBreak ? <Button label="End break" loading={busy === "end"} disabled={busy !== null} onPress={() => void act("end", () => api.endBreak())} /> : null}
              {buttons.startMeal ? <Button label="Start meal break" variant="secondary" loading={busy === "meal"} disabled={busy !== null} onPress={() => startBreak("meal")} /> : null}
              {buttons.startRest ? <Button label="Start rest break" variant="secondary" loading={busy === "rest"} disabled={busy !== null} onPress={() => startBreak("rest")} /> : null}
              {buttons.clockOut ? <Button label="Clock out" variant="danger" loading={busy === "out"} disabled={busy !== null} onPress={confirmClockOut} /> : null}
            </View>

            <Card style={{ gap: space.sm }}>
              <Text style={{ fontFamily: fonts.bodyMedium }}>Breaks today</Text>
              {data.breaks.length === 0 ? (
                <Text muted>No breaks yet.</Text>
              ) : (
                data.breaks.map((b) => (
                  <View key={b.id} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text>{breakLabel(b.kind)}</Text>
                      <Text muted style={{ fontSize: 14 }}>
                        {at(b.startsAt)} to {b.endsAt ? at(b.endsAt) : "now"}
                      </Text>
                    </View>
                    <Text muted>{breakLength(b, now)}</Text>
                  </View>
                ))
              )}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  buttons: { gap: space.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md },
  timer: { fontFamily: fonts.display, fontSize: 44, fontVariant: ["tabular-nums"] },
  breakTimer: { fontFamily: fonts.display, fontSize: 30, fontVariant: ["tabular-nums"] },
});
