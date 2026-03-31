import { StyleSheet } from "react-native";

import { colors, spacing } from "../../theme";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  statusText: {
    color: colors.foreground,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 22,
  },
  errorText: {
    color: "#fca5a5",
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
});
