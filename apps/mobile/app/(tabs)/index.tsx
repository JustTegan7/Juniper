import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { Button, Card, Centered, ErrorBanner, Heading, Pill, Screen, Spinner, Text } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { dayLabel, durationLabel, emptyToday, price, statusActions, statusLabel, timeRange, type StatusAction } from "../../lib/format";
import { useMe, useSession } from "../../lib/session";
import { fonts, space, useColors, type Colors } from "../../lib/theme";
import type { Appointment, AppointmentStatus, TodayScope } from "../../lib/types";
import { useLoad } from "../../lib/use-load";

function statusColor(s: AppointmentStatus, c: Colors): string {
  switch (s) {
    case "confirmed":
    case "completed":
      return c.confirmed;
    case "checked_in":
      return c.today;
    case "cancelled":
    case "no_show":
      return c.cancelled;
    default:
      return c.pending;
  }
}

export default function Today() {
  const me = useMe();
  const { api } = useSession();
  const c = useColors();
  const { vocab } = me.workspace;
  const [scope, setScope] = useState<TodayScope>("mine");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error, loading, refreshing, reload, pull } = useLoad(() => api.today(scope), [api, scope, me.workspace.id]);

  // Fresh data each time the tab is opened.
  useFocusEffect(
    useCallback(() => {
      void reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope, me.workspace.id]),
  );

  async function change(a: Appointment, status: AppointmentStatus) {
    setBusyId(a.id);
    setActionError(null);
    try {
      await api.setAppointmentStatus(a.id, status);
      await reload();
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "unauthorized")) setActionError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  function onAction(a: Appointment, action: StatusAction) {
    if (action.status !== "cancelled") return void change(a, action.status);
    const emailed = a.clientEmail ? ` ${a.clientName} will get a cancellation email.` : "";
    Alert.alert(`Cancel this ${vocab.appointment.toLowerCase()}?`, `${a.clientName}, ${a.serviceName}.${emailed}`, [
      { text: "Keep it", style: "cancel" },
      { text: `Cancel ${vocab.appointment.toLowerCase()}`, style: "destructive", onPress: () => void change(a, "cancelled") },
    ]);
  }

  const staffName = (id: string) => data?.staff.find((s) => s.membershipId === id)?.name ?? vocab.staff;

  return (
    <Screen>
      <View style={styles.header}>
        <Heading size={30}>Today</Heading>
        <Text muted>{data ? dayLabel(data.day) : dayLabel(me.today)}</Text>
        <View style={styles.toggle}>
          <Button small label="Mine" variant={scope === "mine" ? "primary" : "secondary"} onPress={() => setScope("mine")} />
          <Button small label="All" variant={scope === "all" ? "primary" : "secondary"} onPress={() => setScope("all")} />
        </View>
        {error ? <ErrorBanner message={error} /> : null}
        {actionError ? <ErrorBanner message={actionError} /> : null}
      </View>

      {loading && !data ? (
        <Centered>
          <Spinner />
        </Centered>
      ) : (
        <FlatList
          data={data?.appointments ?? []}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pull()} tintColor={c.primary} />}
          ListEmptyComponent={!error ? <Text muted style={{ textAlign: "center", marginTop: space.xl }}>{emptyToday(vocab, scope)}</Text> : undefined}
          renderItem={({ item: a }) => {
            const actions = statusActions(a.status);
            return (
              <Card style={{ gap: space.sm }}>
                <View style={styles.row}>
                  <Text style={{ fontFamily: fonts.bodyMedium }}>{timeRange(a, me.workspace.timezone)}</Text>
                  <Pill label={statusLabel(a.status)} color={statusColor(a.status, c)} />
                </View>
                <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 18 }}>{a.clientName}</Text>
                <Text muted>
                  {a.serviceName}, {durationLabel(a)}, {price(a.priceCents)}
                </Text>
                {scope === "all" ? <Text muted>{vocab.staff}: {staffName(a.membershipId)}</Text> : null}
                {a.clientNote ? <Text muted>{vocab.client} note: {a.clientNote}</Text> : null}
                {a.staffNote ? <Text muted>Note: {a.staffNote}</Text> : null}
                {actions.length > 0 ? (
                  <View style={styles.actions}>
                    {actions.map((act) => (
                      <Button
                        key={act.status}
                        small
                        label={act.label}
                        variant={act.destructive ? "danger" : "secondary"}
                        loading={busyId === a.id}
                        disabled={busyId !== null}
                        onPress={() => onAction(a, act)}
                      />
                    ))}
                  </View>
                ) : null}
              </Card>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm },
  toggle: { flexDirection: "row", gap: space.sm },
  list: { padding: space.lg, paddingBottom: space.xxl },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
});
