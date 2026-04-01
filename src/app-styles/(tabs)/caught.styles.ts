import { StyleSheet } from "react-native";

import { colors, spacing } from "../../theme";

export const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    textTransform: "uppercase",
    color: colors.primary,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.foreground,
  },
  subtitle: {
    fontSize: 15,
    color: "rgba(203,213,225,0.9)",
  },
  message: {
    color: "rgba(203,213,225,0.9)",
    fontSize: 14,
  },
  helper: {
    gap: spacing.sm,
  },
  error: {
    color: "#fca5a5",
    fontSize: 14,
  },
  separator: {
    height: spacing.sm,
  },
});
