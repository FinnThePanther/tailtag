import { StyleSheet } from "react-native";

import { radius, spacing } from "../../../theme";

export const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  thumbnailWrap: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "rgba(30,41,59,0.8)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
  },
  thumbnailPressed: {
    opacity: 0.8,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
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
  fullscreenActions: {
    position: "absolute",
    bottom: 48,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
  },
});
