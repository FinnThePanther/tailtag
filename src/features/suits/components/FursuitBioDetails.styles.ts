import { StyleSheet } from "react-native";

import { colors, radius, spacing } from "../../../theme";

export const styles = StyleSheet.create({
  sections: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    color: colors.primary,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 2,
    fontWeight: "600",
  },
  sectionBody: {
    color: "rgba(203,213,225,0.95)",
    fontSize: 14,
    lineHeight: 20,
  },
  socialList: {
    gap: spacing.sm,
  },
  socialLink: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(30,41,59,0.6)",
  },
  socialLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  socialUrl: {
    color: "#38bdf8",
    fontSize: 13,
  },
});
