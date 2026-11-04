import { useState } from "react";
import { View } from "react-native";
import { BusinessList } from "../components/business-list";
import { Button, ErrorBanner, Heading, Screen, Text } from "../components/ui";
import { useSession } from "../lib/session";
import { space } from "../lib/theme";

export default function ChooseBusiness() {
  const { state, chooseBusiness, signOut } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  if (state.status !== "choosing") return null;

  async function pick(id: string) {
    setBusyId(id);
    setError(null);
    const err = await chooseBusiness(id);
    if (err) setError(err);
    setBusyId(null);
  }

  return (
    <Screen>
      <View style={{ padding: space.xl, gap: space.lg, flex: 1 }}>
        <Heading size={28}>Which business today?</Heading>
        <Text muted>You are on more than one team. You can switch any time from the More tab.</Text>
        {error ? <ErrorBanner message={error} /> : null}
        <BusinessList businesses={state.businesses} activeId={null} busyId={busyId} onPick={(id) => void pick(id)} />
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}
