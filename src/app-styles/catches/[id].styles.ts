import { StyleSheet } from "react-native";

import { colors, spacing } from "../../theme";

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  centeredContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  message: {
    color: "rgba(203,213,225,0.9)",
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  detailStack: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    color: "rgba(148,163,184,0.7)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  catchPhoto: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 8,
    backgroundColor: "rgba(30,41,59,0.8)",
  },
  pressed: {
    opacity: 0.7,
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenClose: {
    position: "absolute",
    top: 52,
    right: spacing.lg,
    zIndex: 10,
    padding: spacing.sm,
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
});
