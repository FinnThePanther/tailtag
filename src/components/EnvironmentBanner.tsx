import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { APP_ENV } from "../lib/runtimeConfig";

const ENV_CONFIG = {
  development: { label: "DEV", backgroundColor: "#b45309", textColor: "#fef3c7" },
  staging: { label: "STAGING", backgroundColor: "#c2410c", textColor: "#fff7ed" },
} as const;

type KnownEnv = keyof typeof ENV_CONFIG;

function isKnownEnv(env: string | undefined): env is KnownEnv {
  return env === "development" || env === "staging";
}

export function EnvironmentBanner() {
  const insets = useSafeAreaInsets();

  if (!isKnownEnv(APP_ENV)) {
    return null;
  }

  const { label, backgroundColor, textColor } = ENV_CONFIG[APP_ENV];

  return (
    <View
      style={[styles.banner, { backgroundColor, top: insets.top }]}
      pointerEvents="none"
    >
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: "center",
    paddingVertical: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
});
