import { Tabs } from "expo-router";
import { fonts, useColors } from "../../lib/theme";

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 13 },
        tabBarIconStyle: { display: "none" },
        tabBarLabelPosition: "beside-icon",
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="clock" options={{ title: "Clock" }} />
      <Tabs.Screen name="time-off" options={{ title: "Time off" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
