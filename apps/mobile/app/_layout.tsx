// Import single weights, not the package index, so the app only ships the four fonts it uses.
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Button, Centered, ErrorBanner, Heading, Spinner } from "../components/ui";
import { SessionProvider, useSession } from "../lib/session";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Fraunces_600SemiBold, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);
  const scheme = useColorScheme();
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

/** Signed out goes to sign in; signed in loads /me and picks a business. Stack.Protected keeps each state's screens apart. */
function Gate() {
  const { state, retry, signOut } = useSession();

  if (state.status === "loading") {
    return (
      <Centered>
        <Spinner />
      </Centered>
    );
  }
  if (state.status === "error") {
    return (
      <Centered>
        <Heading size={24}>We could not load Juniper</Heading>
        <ErrorBanner message={state.message} />
        <Button label="Try again" onPress={() => void retry()} />
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
      </Centered>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={state.status === "signed-out"}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={state.status === "no-workspace"}>
        <Stack.Screen name="no-workspace" />
      </Stack.Protected>
      <Stack.Protected guard={state.status === "choosing"}>
        <Stack.Screen name="choose-business" />
      </Stack.Protected>
      <Stack.Protected guard={state.status === "ready"}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}
