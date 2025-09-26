import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "../../src/theme";

const iconForRoute = (name: string, focused: boolean) => {
  const color = focused ? colors.primary : "rgba(203,213,225,0.8)";

  switch (name) {
    case "index":
      return (
        <Ionicons
          name={focused ? "home" : "home-outline"}
          size={22}
          color={color}
        />
      );
    case "caught":
      return (
        <Ionicons
          name={focused ? "ribbon" : "ribbon-outline"}
          size={22}
          color={color}
        />
      );
    case "catch":
      return (
        <Ionicons
          name={focused ? "scan" : "scan-outline"}
          size={22}
          color={color}
        />
      );
    case "suits":
      return (
        <Ionicons
          name={focused ? "paw" : "paw-outline"}
          size={22}
          color={color}
        />
      );
    case "settings":
      return (
        <Ionicons
          name={focused ? "settings" : "settings-outline"}
          size={22}
          color={color}
        />
      );
    default:
      return <Ionicons name="ellipse" size={22} color={color} />;
  }
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0f172a",
          borderTopColor: "rgba(148,163,184,0.2)",
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: "rgba(203,213,225,0.8)",
        tabBarIcon: ({ focused }) => iconForRoute(route.name, focused),
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
        sceneStyle: { backgroundColor: colors.background },
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="caught" options={{ title: "Caught" }} />
      <Tabs.Screen name="catch" options={{ title: "Catch" }} />
      <Tabs.Screen name="suits" options={{ title: "My Suits" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
