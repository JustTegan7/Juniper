import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Platform, Pressable, StyleSheet, useColorScheme, View } from "react-native";
import { Text } from "./ui";
import { fonts, radius, space, useColors } from "../lib/theme";

type Props = {
  label: string;
  mode: "date" | "time";
  value: Date;
  /** What to show on Android, where the picker opens as a dialog from a button. */
  display: string;
  onChange: (next: Date) => void;
  disabled?: boolean;
};

/**
 * A labelled date or time field. iOS shows the system's compact picker in place; Android shows a button that opens the system dialog.
 * Values are the phone's local wall clock, which is exactly what we send (days and HH:MM are business time labels, not instants).
 */
export function PickerField({ label, mode, value, display, onChange, disabled }: Props) {
  const c = useColors();
  const dark = useColorScheme() === "dark";

  function openAndroid() {
    DateTimePickerAndroid.open({
      value,
      mode,
      is24Hour: false,
      onChange: (e: DateTimePickerEvent, picked?: Date) => {
        if (e.type === "set" && picked) onChange(picked);
      },
    });
  }

  return (
    <View style={styles.row}>
      <Text style={{ fontFamily: fonts.bodyMedium }}>{label}</Text>
      {Platform.OS === "ios" ? (
        <DateTimePicker
          value={value}
          mode={mode}
          display="compact"
          themeVariant={dark ? "dark" : "light"}
          accentColor={c.primary}
          disabled={disabled}
          onChange={(_e, picked) => {
            if (picked) onChange(picked);
          }}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${display}`}
          disabled={disabled}
          onPress={openAndroid}
          style={[styles.button, { borderColor: c.border, backgroundColor: c.surface, opacity: disabled ? 0.5 : 1 }]}
        >
          <Text>{display}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44, gap: space.md },
  button: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 44, justifyContent: "center" },
});
