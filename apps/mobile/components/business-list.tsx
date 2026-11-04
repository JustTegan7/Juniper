import { View } from "react-native";
import { Button, Card, Text } from "./ui";
import { space } from "../lib/theme";
import type { BusinessRef } from "../lib/types";

/** One row per business. The active one is marked and not tappable. */
export function BusinessList({ businesses, activeId, busyId, onPick }: { businesses: BusinessRef[]; activeId: string | null; busyId: string | null; onPick: (id: string) => void }) {
  return (
    <View style={{ gap: space.sm }}>
      {businesses.map((b) => (
        <Card key={b.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
          <Text style={{ flex: 1 }}>{b.name}</Text>
          {b.id === activeId ? (
            <Text muted>Current</Text>
          ) : (
            <Button small variant="secondary" label="Open" loading={busyId === b.id} disabled={busyId !== null} onPress={() => onPick(b.id)} />
          )}
        </Card>
      ))}
    </View>
  );
}
