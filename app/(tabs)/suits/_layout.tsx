import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../../../src/theme";

export default function SuitsLayout() {
  const insets = useSafeAreaInsets();

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
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
          title: "My Suits",
          contentStyle: {
            backgroundColor: colors.background,
            // This screen has no header, so we need to add safe area padding
            paddingTop: insets.top,
          },
        }}
      />
      <Stack.Screen
        name="add-fursuit"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
