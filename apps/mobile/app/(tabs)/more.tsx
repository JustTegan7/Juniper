import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { BusinessList } from "../../components/business-list";
import { Button, Card, ErrorBanner, Heading, Screen, Text } from "../../components/ui";
import { roleLabel } from "../../lib/format";
import { useMe, useSession } from "../../lib/session";
import { fonts, space } from "../../lib/theme";
import { canSwitch } from "../../lib/switcher";

export default function More() {
  const me = useMe();
  const { signOut, chooseBusiness } = useSession();
  const [switching, setSwitching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(id: string) {
    setBusyId(id);
    setError(null);
    const err = await chooseBusiness(id);
    if (err) setError(err);
    else setSwitching(false);
    setBusyId(null);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Heading size={30}>More</Heading>
        <Card style={{ gap: space.xs }}>
          <Text muted>Signed in as</Text>
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 18 }}>{me.user.name}</Text>
          <Text muted>{me.user.email}</Text>
          <Text muted>{roleLabel(me.role)}</Text>
        </Card>
        <Card style={{ gap: space.xs }}>
          <Text muted>Business</Text>
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 18 }}>{me.workspace.name}</Text>
          <Text muted>Time zone: {me.workspace.timezone}</Text>
        </Card>
        {canSwitch(me.workspaces) ? (
          <View style={{ gap: space.sm }}>
            <Button label={switching ? "Hide businesses" : "Switch business"} variant="secondary" onPress={() => setSwitching((v) => !v)} />
            {switching ? (
              <>
                {error ? <ErrorBanner message={error} /> : null}
                <BusinessList businesses={me.workspaces} activeId={me.workspace.id} busyId={busyId} onPick={(id) => void pick(id)} />
              </>
            ) : null}
          </View>
        ) : null}
        <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ body: { padding: space.lg, gap: space.md } });
