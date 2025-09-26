import { Stack } from "expo-router";

import { colors } from "../../../src/theme";

export default function SuitsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: "#0f172a" },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.foreground },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="add-fursuit" options={{ title: "Add a Fursuit" }} />
    </Stack>
  );
}
