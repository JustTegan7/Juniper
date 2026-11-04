import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { isManager } from "@evergreen/core";
import { Button, Card, Centered, ErrorBanner, Heading, Input, NoticeBanner, Pill, Screen, Spinner, Text } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { timeOffWhen } from "../../lib/format";
import { subscribe } from "../../lib/refresh-bus";
import { useMe, useSession } from "../../lib/session";
import { fonts, space, useColors, type Colors } from "../../lib/theme";
import { canCancel, canReview } from "../../lib/time-off";
import type { TimeOffDecision, TimeOffRequest, TimeOffScope, TimeOffStatus } from "../../lib/types";
import { useLoad } from "../../lib/use-load";
import { useNotice } from "../../lib/use-notice";

const STATUS_LABEL: Record<TimeOffStatus, string> = { pending: "Pending", approved: "Approved", denied: "Denied", cancelled: "Cancelled" };

function statusColor(s: TimeOffStatus, c: Colors) {
  return s === "approved" ? c.confirmed : s === "pending" ? c.pending : c.cancelled;
}

export default function TimeOff() {
  const me = useMe();
  const { api } = useSession();
  const c = useColors();
  const { vocab } = me.workspace;
  const [scope, setScope] = useState<TimeOffScope>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Which card is asking for an optional note before approving or denying.
  const [reviewing, setReviewing] = useState<{ id: string; decision: TimeOffDecision } | null>(null);
  const [note, setNote] = useState("");
  const notice = useNotice();

  const { data, error, loading, refreshing, sync, pull } = useLoad(() => api.timeOff(scope), [api, scope, me.workspace.id]);

  // The Request screen tells us when it saved something, so the list refreshes and shows the server's message.
  useEffect(
    () =>
      subscribe("time-off", (message) => {
        if (message) notice.show(message);
        void sync();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const viewer = { role: me.role, membershipId: me.membershipId };
  const seeAll = isManager(me.role);

  async function run(id: string, call: () => Promise<{ message: string }>) {
    if (busyId) return;
    setBusyId(id);
    setActionError(null);
    notice.clear();
    try {
      const res = await call();
      notice.show(res.message);
      setReviewing(null);
      setNote("");
      await sync();
    } catch (e) {
      if (e instanceof ApiError && e.code === "unauthorized") return;
      setActionError(errorMessage(e));
      // The request may have changed on the server (already reviewed or cancelled). Match it.
      if (e instanceof ApiError && (e.status === 400 || e.status === 409 || e.status === 404)) await sync();
    } finally {
      setBusyId(null);
    }
  }

  function confirmCancel(r: TimeOffRequest) {
    Alert.alert("Cancel this request?", `${timeOffWhen(r, me.workspace.timezone)}.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel request", style: "destructive", onPress: () => void run(r.id, () => api.cancelTimeOff(r.id)) },
    ]);
  }

  function startReview(r: TimeOffRequest, decision: TimeOffDecision) {
    setActionError(null);
    setNote("");
    setReviewing({ id: r.id, decision });
  }

  const showingOtherScope = data !== null && data.scope !== scope;
  const emptyText = scope === "open" ? "No open time off requests." : "No past time off requests.";

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pull()} tintColor={c.primary} />}
      >
        <View style={styles.titleRow}>
          <Heading size={30}>Time off</Heading>
          <Button small label="Request" onPress={() => router.push("/time-off-new")} />
        </View>
        <Text muted>{seeAll ? `Requests from your ${vocab.staffPlural.toLowerCase()} and you.` : "Your requests."}</Text>
        <View style={styles.toggle}>
          <Button small label="Open" variant={scope === "open" ? "primary" : "secondary"} onPress={() => setScope("open")} />
          <Button small label="Past" variant={scope === "past" ? "primary" : "secondary"} onPress={() => setScope("past")} />
        </View>
        {notice.message ? <NoticeBanner message={notice.message} /> : null}
        {error ? <ErrorBanner message={error} /> : null}
        {actionError ? <ErrorBanner message={actionError} /> : null}
        {(loading && !data) || showingOtherScope ? (
          <Centered>
            <Spinner />
          </Centered>
        ) : data ? (
          <>
            {data.requests.length === 0 && !error ? <Text muted>{emptyText}</Text> : null}
            {data.requests.map((r) => {
              const mine = r.membershipId === me.membershipId;
              const review = canReview(viewer, r);
              const cancel = canCancel(viewer, r, new Date());
              const busy = busyId === r.id;
              const open = reviewing?.id === r.id ? reviewing : null;
              return (
                <Card key={r.id} style={{ gap: space.xs }}>
                  <View style={styles.row}>
                    <Text style={{ fontFamily: fonts.bodyMedium, flexShrink: 1 }}>{mine ? `${r.name} (you)` : r.name}</Text>
                    <Pill label={STATUS_LABEL[r.status]} color={statusColor(r.status, c)} />
                  </View>
                  <Text>{timeOffWhen(r, me.workspace.timezone)}</Text>
                  {r.reason ? <Text muted>{r.reason}</Text> : null}
                  {r.reviewNote ? <Text muted>Note: {r.reviewNote}</Text> : null}

                  {open ? (
                    <View style={{ gap: space.sm, marginTop: space.sm }}>
                      <Input value={note} onChangeText={setNote} placeholder="Add a note (optional)" accessibilityLabel="Note" maxLength={500} />
                      <View style={styles.actions}>
                        <Button
                          small
                          label={open.decision === "approved" ? "Confirm approve" : "Confirm deny"}
                          variant={open.decision === "approved" ? "primary" : "danger"}
                          loading={busy}
                          disabled={busyId !== null}
                          onPress={() => void run(r.id, () => api.reviewTimeOff(r.id, open.decision, note.trim() || undefined))}
                        />
                        <Button small label="Back" variant="secondary" disabled={busyId !== null} onPress={() => setReviewing(null)} />
                      </View>
                    </View>
                  ) : review || cancel ? (
                    <View style={styles.actions}>
                      {review ? <Button small label="Approve" disabled={busyId !== null} onPress={() => startReview(r, "approved")} /> : null}
                      {review ? <Button small label="Deny" variant="danger" disabled={busyId !== null} onPress={() => startReview(r, "denied")} /> : null}
                      {cancel ? <Button small label="Cancel request" variant="danger" loading={busy} disabled={busyId !== null} onPress={() => confirmCancel(r)} /> : null}
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  toggle: { flexDirection: "row", gap: space.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
});
