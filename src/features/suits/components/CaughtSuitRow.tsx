import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing } from "../../../theme";
import type { FursuitColorOption } from "../../colors";
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
      <View style={styles.thumbnail}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.thumbnailImage} />
        ) : (
          <View style={styles.thumbnailFallback}>
            <Ionicons name="paw" size={20} color="rgba(148,163,184,0.4)" />
          </View>
        )}
      </View>
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
  thumbnail: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "rgba(30,41,59,0.8)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  thumbnailFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
