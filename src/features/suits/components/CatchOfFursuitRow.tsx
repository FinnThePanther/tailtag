import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppAvatar } from "../../../components/ui/AppAvatar";
import { colors, radius, spacing } from "../../../theme";
import { toDisplayDate } from "../../../utils/dates";

type CatchOfFursuitRowProps = {
  catchPhotoUrl?: string | null;
  catcherUsername?: string | null;
  catcherAvatarUrl?: string | null;
  caughtAt?: string | null;
  onPress?: () => void;
};

export function CatchOfFursuitRow({
  catchPhotoUrl,
  catcherUsername,
  catcherAvatarUrl,
  caughtAt,
  onPress,
}: CatchOfFursuitRowProps) {
  const displayName =
    catcherUsername?.trim() || "Someone";
  const displayDate = toDisplayDate(caughtAt);
  const thumbnailUrl = catchPhotoUrl ?? catcherAvatarUrl;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens catch details"
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <AppAvatar url={thumbnailUrl} size="md" fallback="user" />
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        {displayDate ? (
          <Text style={styles.date} numberOfLines={1}>
            {displayDate}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color="rgba(148,163,184,0.5)"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
