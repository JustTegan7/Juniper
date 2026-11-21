import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { BusinessList } from "../../components/business-list";
import { NotificationsCard } from "../../components/notifications-card";
import { Button, Card, ErrorBanner, Heading, Input, Screen, Text } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { roleLabel } from "../../lib/format";
import { useMe, useSession } from "../../lib/session";
import { fonts, space } from "../../lib/theme";
import { canSwitch } from "../../lib/switcher";

export default function More() {
  const me = useMe();
  const { api, signOut, chooseBusiness } = useSession();
  const [switching, setSwitching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function removeAccount() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteAccount(confirm);
      await signOut();
    } catch (e) {
      setDeleteError(errorMessage(e));
      setDeleteBusy(false);
    }
  }

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
        <NotificationsCard />
        <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
        <Card style={{ gap: space.sm }}>
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 16 }}>Delete account</Text>
          <Text muted>Removes your login and name from Juniper. Your past appointments and timesheets stay in the business records without your name. This cannot be undone.</Text>
          {deleting ? (
            <>
              {deleteError ? <ErrorBanner message={deleteError} /> : null}
              <Text muted>Type your email address ({me.user.email}) to confirm.</Text>
              <Input value={confirm} onChangeText={setConfirm} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" />
              <Button label="Delete my account" variant="danger" loading={deleteBusy} disabled={deleteBusy || confirm.trim().length === 0} onPress={() => void removeAccount()} />
              <Button label="Cancel" variant="secondary" disabled={deleteBusy} onPress={() => { setDeleting(false); setConfirm(""); setDeleteError(null); }} />
            </>
          ) : (
            <Button label="Delete my account" variant="secondary" onPress={() => setDeleting(true)} />
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ body: { padding: space.lg, gap: space.md } });
