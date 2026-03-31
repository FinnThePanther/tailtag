import { StyleSheet } from "react-native";

import { colors, radius, spacing } from "../../../theme";

export const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "rgba(15,23,42,0.85)",
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.75,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  date: {
    color: "rgba(148,163,184,0.7)",
    fontSize: 12,
  },
});
