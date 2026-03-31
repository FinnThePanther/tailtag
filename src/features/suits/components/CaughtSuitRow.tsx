import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppAvatar } from "../../../components/ui/AppAvatar";
import { colors, radius, spacing } from "../../../theme";
import { toDisplayDate } from "../../../utils/dates";

type CaughtSuitRowProps = {
  name: string;
  species?: string | null;
  avatarUrl?: string | null;
  caughtAt?: string | null;
  onPress?: () => void;
};

export function CaughtSuitRow({
  name,
  species,
  avatarUrl,
  caughtAt,
  onPress,
}: CaughtSuitRowProps) {
  const displaySpecies = species?.trim() || "Species not set";
  const displayDate = toDisplayDate(caughtAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens catch details"
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <AppAvatar url={avatarUrl} size="md" fallback="fursuit" />
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.species} numberOfLines={1}>
          {displaySpecies}
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
  species: {
    color: "rgba(203,213,225,0.9)",
    fontSize: 13,
  },
  date: {
    color: "rgba(148,163,184,0.7)",
    fontSize: 12,
  },
});
