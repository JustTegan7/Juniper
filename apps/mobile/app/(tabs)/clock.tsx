import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { formatTimeIn } from "@evergreen/core";
import { Card, Centered, ErrorBanner, Heading, Screen, Spinner, Text } from "../../components/ui";
import { useMe, useSession } from "../../lib/session";
import { fonts, space, useColors } from "../../lib/theme";
import { useLoad } from "../../lib/use-load";

export default function Clock() {
  const me = useMe();
  const { api } = useSession();
  const c = useColors();
  const tz = me.workspace.timezone;
  const { data, error, loading, refreshing, reload, pull } = useLoad(() => api.clock(), [api, me.workspace.id]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me.workspace.id]),
  );

  const at = (iso: string) => formatTimeIn(new Date(iso), tz);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pull()} tintColor={c.primary} />}>
        <Heading size={30}>Clock</Heading>
        {error ? <ErrorBanner message={error} /> : null}
        {loading && !data ? (
          <Centered>
            <Spinner />
          </Centered>
        ) : data ? (
          <>
            <Card style={{ gap: space.xs }}>
              <Text muted>Status</Text>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 20 }}>{data.clockedIn ? "Clocked in" : "Not clocked in"}</Text>
              {data.entry ? <Text muted>Since {at(data.entry.clockIn)}</Text> : null}
              {data.openBreak ? (
                <Text muted>
                  On a {data.openBreak.kind} break since {at(data.openBreak.startsAt)}
                </Text>
              ) : null}
            </Card>
            <Card style={{ gap: space.sm }}>
              <Text style={{ fontFamily: fonts.bodyMedium }}>Breaks today</Text>
              {data.breaks.length === 0 ? (
                <Text muted>No breaks yet.</Text>
              ) : (
                data.breaks.map((b) => (
                  <View key={b.id} style={styles.row}>
                    <Text>{b.kind === "meal" ? "Meal" : "Rest"}</Text>
                    <Text muted>
                      {at(b.startsAt)} to {b.endsAt ? at(b.endsAt) : "now"}
                    </Text>
                  </View>
                ))
              )}
            </Card>
            <Text muted>Clock in, clock out and breaks are coming in the next update.</Text>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md },
  row: { flexDirection: "row", justifyContent: "space-between" },
});
