import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, View } from "react-native";
import { formatDay, formatMinutes, parseHm } from "@evergreen/core";
import { PickerField } from "../components/picker-field";
import { Button, Card, ErrorBanner, Heading, Input, Screen, Text } from "../components/ui";
import { ApiError, errorMessage } from "../lib/api";
import { publish } from "../lib/refresh-bus";
import { useMe, useSession } from "../lib/session";
import { space, useColors } from "../lib/theme";
import { buildRequest, dayFromPicker, pickerDate, pickerTime, timeFromPicker, validateRange } from "../lib/time-off";

/** Request time off, for yourself. Modal over the tabs. */
export default function RequestTimeOff() {
  const me = useMe();
  const { api } = useSession();
  const c = useColors();
  const [startDay, setStartDay] = useState(me.today);
  const [endDay, setEndDay] = useState(me.today);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayText = (d: string) => formatDay(d, { weekday: "short", year: true });
  const timeText = (hm: string) => formatMinutes(parseHm(hm) ?? 0);

  function pickStart(next: Date) {
    const day = dayFromPicker(next);
    setStartDay(day);
    // Keep the range valid while picking, so the common case needs no error message.
    if (endDay < day) setEndDay(day);
  }

  async function submit() {
    if (busy) return;
    const problem = validateRange(startDay, endDay);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const res = await api.requestTimeOff(buildRequest({ startDay, endDay, allDay, startTime, endTime, reason }));
      publish("time-off", res.message);
      router.back();
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "unauthorized")) setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Heading size={30}>Request time off</Heading>
          {error ? <ErrorBanner message={error} /> : null}
          <Card style={{ gap: space.sm }}>
            <PickerField label="First day" mode="date" value={pickerDate(startDay)} display={dayText(startDay)} onChange={pickStart} disabled={busy} />
            <PickerField label="Last day" mode="date" value={pickerDate(endDay)} display={dayText(endDay)} onChange={(d) => setEndDay(dayFromPicker(d))} disabled={busy} />
            <View style={styles.switchRow}>
              <Text style={{ flex: 1 }}>All day</Text>
              <Switch value={allDay} onValueChange={setAllDay} disabled={busy} trackColor={{ true: c.primary }} accessibilityLabel="All day" />
            </View>
            {allDay ? null : (
              <>
                <PickerField label="Start time" mode="time" value={pickerTime(startTime)} display={timeText(startTime)} onChange={(d) => setStartTime(timeFromPicker(d))} disabled={busy} />
                <PickerField label="End time" mode="time" value={pickerTime(endTime)} display={timeText(endTime)} onChange={(d) => setEndTime(timeFromPicker(d))} disabled={busy} />
              </>
            )}
          </Card>
          <Input value={reason} onChangeText={setReason} placeholder="Reason (optional)" accessibilityLabel="Reason" multiline maxLength={500} editable={!busy} />
          <Button label="Send request" loading={busy} onPress={() => void submit()} />
          <Button label="Cancel" variant="secondary" disabled={busy} onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  switchRow: { flexDirection: "row", alignItems: "center", minHeight: 44 },
});
