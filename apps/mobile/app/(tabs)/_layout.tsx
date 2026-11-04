import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { fonts, useColors } from "../../lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** Outline icon, filled when the tab is selected. */
const icon = (outline: IconName, filled: IconName) =>
  function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    return <Ionicons name={focused ? filled : outline} size={size} color={color as string} />;
  };

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: icon("calendar-outline", "calendar") }} />
      <Tabs.Screen name="clock" options={{ title: "Clock", tabBarIcon: icon("time-outline", "time") }} />
      <Tabs.Screen name="time-off" options={{ title: "Time off", tabBarIcon: icon("sunny-outline", "sunny") }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: icon("ellipsis-horizontal-circle-outline", "ellipsis-horizontal-circle") }} />
    </Tabs>
  );
}
