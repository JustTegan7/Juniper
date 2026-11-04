import { Button, Centered, Heading, Screen, Text } from "../components/ui";
import { useSession } from "../lib/session";

export default function NoWorkspace() {
  const { signOut, retry } = useSession();
  return (
    <Screen>
      <Centered>
        <Heading size={28}>You are not on a team yet</Heading>
        <Text muted style={{ textAlign: "center" }}>
          Ask your business owner to invite you. Once you accept the invite, come back and check again.
        </Text>
        <Button label="Check again" onPress={() => void retry()} />
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
      </Centered>
    </Screen>
  );
}
