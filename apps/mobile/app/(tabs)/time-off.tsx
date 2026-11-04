import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import { formatDay } from "@evergreen/core";
import { Card, Centered, ErrorBanner, Heading, Pill, Screen, Spinner, Text } from "../../components/ui";
import { useMe, useSession } from "../../lib/session";
import { fonts, space, useColors, type Colors } from "../../lib/theme";
import type { TimeOffStatus } from "../../lib/types";
import { useLoad } from "../../lib/use-load";

const STATUS_LABEL: Record<TimeOffStatus, string> = { pending: "Pending", approved: "Approved", denied: "Denied", cancelled: "Cancelled" };

function statusColor(s: TimeOffStatus, c: Colors) {
  return s === "approved" ? c.confirmed : s === "pending" ? c.pending : c.cancelled;
}

export default function TimeOff() {
  const me = useMe();
  const { api } = useSession();
  const c = useColors();
  const { data, error, loading, refreshing, reload, pull } = useLoad(() => api.timeOff("open"), [api, me.workspace.id]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me.workspace.id]),
  );

  const range = (start: string, end: string) => (start === end ? formatDay(start, { weekday: "short" }) : `${formatDay(start, { weekday: "short" })} to ${formatDay(end, { weekday: "short" })}`);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pull()} tintColor={c.primary} />}>
        <Heading size={30}>Time off</Heading>
        {error ? <ErrorBanner message={error} /> : null}
        {loading && !data ? (
          <Centered>
            <Spinner />
          </Centered>
        ) : data ? (
          <>
            {data.requests.length === 0 ? <Text muted>No open time off requests.</Text> : null}
            {data.requests.map((r) => (
              <Card key={r.id} style={{ gap: space.xs }}>
                <Text style={{ fontFamily: fonts.bodyMedium }}>{r.name}</Text>
                <Text>{range(r.startDay, r.endDay)}{r.allDay ? ", all day" : ""}</Text>
                {r.reason ? <Text muted>{r.reason}</Text> : null}
                <Pill label={STATUS_LABEL[r.status]} color={statusColor(r.status, c)} />
              </Card>
            ))}
            <Text muted>Requesting and reviewing time off are coming in the next update.</Text>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ body: { padding: space.lg, gap: space.md } });
