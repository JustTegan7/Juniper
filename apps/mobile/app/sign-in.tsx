import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from "react-native";
import { Button, ErrorBanner, Heading, Screen, Text } from "../components/ui";
import { useSession } from "../lib/session";
import { fonts, radius, space, useColors } from "../lib/theme";

export default function SignIn() {
  const { signIn } = useSession();
  const c = useColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(null);
    const err = await signIn(email, password);
    // On success the gate swaps screens, so only reset the form when it failed.
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  const input = [styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.fg, fontFamily: fonts.body }];

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <View style={styles.form}>
          <Heading size={40}>Juniper</Heading>
          <Text muted>Sign in with the email and password you use on the web.</Text>
          {error ? <ErrorBanner message={error} /> : null}
          <TextInput
            style={input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={c.muted}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            accessibilityLabel="Email"
          />
          <TextInput
            style={input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={c.muted}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={() => void submit()}
            accessibilityLabel="Password"
          />
          <Button label="Sign in" onPress={() => void submit()} loading={busy} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", padding: space.xl },
  form: { gap: space.md },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.lg, minHeight: 48, fontSize: 16 },
});
