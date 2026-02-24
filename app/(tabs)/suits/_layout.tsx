import { Platform, Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../../../src/theme";

export default function SuitsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
          headerShown: true,
          title: "Add a Fursuit",
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              style={{ paddingHorizontal: Platform.OS === "android" ? 8 : 0 }}
            >
              <Ionicons
                name={Platform.OS === "ios" ? "chevron-back" : "arrow-back"}
                size={24}
                color={colors.primary}
              />
            </Pressable>
          ),
        }}
      />
    </Stack>
  );
}
