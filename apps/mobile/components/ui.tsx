import { ActivityIndicator, Pressable, StyleSheet, Text as RNText, TextInput, View, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fonts, radius, space, useColors } from "../lib/theme";
import type { ReactNode } from "react";

/** Body text (DM Sans). */
export function Text({ style, muted, ...rest }: TextProps & { muted?: boolean }) {
  const c = useColors();
  return <RNText {...rest} style={[{ fontFamily: fonts.body, fontSize: 16, color: muted ? c.muted : c.fg }, style]} />;
}

/** Heading text (Fraunces). */
export function Heading({ style, size = 28, ...rest }: TextProps & { size?: number }) {
  const c = useColors();
  return <RNText accessibilityRole="header" {...rest} style={[{ fontFamily: fonts.display, fontSize: size, color: c.fg }, style]} />;
}

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[{ flex: 1, backgroundColor: c.bg }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>{children}</View>;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = "primary", loading, disabled, small, style }: ButtonProps) {
  const c = useColors();
  const bg = variant === "primary" ? c.primary : "transparent";
  const fg = variant === "primary" ? c.primaryFg : variant === "danger" ? c.cancelled : c.primary;
  const border = variant === "primary" ? c.primary : variant === "danger" ? c.cancelled : c.border;
  const textStyle: TextStyle = { fontFamily: fonts.bodyMedium, fontSize: small ? 14 : 16, color: fg };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small ? styles.buttonSmall : null,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <RNText style={textStyle}>{label}</RNText>}
    </Pressable>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  const c = useColors();
  return (
    <View accessibilityRole="alert" style={[styles.banner, { borderColor: c.cancelled, backgroundColor: c.surface }]}>
      <Text style={{ color: c.cancelled, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

/** A short confirmation (the server's own message after a write). Announced to screen readers. */
export function NoticeBanner({ message }: { message: string }) {
  const c = useColors();
  return (
    <View accessibilityLiveRegion="polite" style={[styles.banner, { borderColor: c.confirmed, backgroundColor: c.surface }]}>
      <Text style={{ color: c.confirmed, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

/** Text field in the brand look (DM Sans, border, light and dark). */
export function Input({ style, multiline, ...rest }: TextInputProps) {
  const c = useColors();
  return (
    <TextInput
      placeholderTextColor={c.muted}
      multiline={multiline}
      {...rest}
      style={[
        styles.input,
        { fontFamily: fonts.body, color: c.fg, borderColor: c.border, backgroundColor: c.surface },
        multiline ? { minHeight: 88, paddingTop: space.md, textAlignVertical: "top" } : null,
        style,
      ]}
    />
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

export function Spinner() {
  const c = useColors();
  return <ActivityIndicator color={c.primary} />;
}

export function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <RNText style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color }}>{label}</RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.lg },
  button: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg },
  buttonSmall: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.lg, minHeight: 48, fontSize: 16 },
  banner: { borderWidth: 1, borderRadius: radius.sm, padding: space.md },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, alignSelf: "flex-start" },
});
