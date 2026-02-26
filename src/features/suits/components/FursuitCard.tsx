import type { ReactNode } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";

import { colors, radius, spacing } from "../../../theme";
import type { FursuitColorOption } from "../../colors";

const SCREEN_WIDTH = Dimensions.get("window").width;
const IS_SMALL_SCREEN = SCREEN_WIDTH <= 375;

const DEFAULT_SPECIES = "Species not set yet";
const DEFAULT_CODE = "Pending code";

type FursuitCardProps = {
  name: string;
  species?: string | null;
  colors?: FursuitColorOption[];
  avatarUrl?: string | null;
  uniqueCode?: string | null;
  timelineLabel?: string | null;
  codeLabel?: string;
  actionSlot?: ReactNode;
  onPress?: () => void;
  onCodeCopied?: () => void;
};

const normalizeSpecies = (value: string | null | undefined) => {
  if (!value) {
    return DEFAULT_SPECIES;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_SPECIES;
};

const buildColorLine = (value: FursuitColorOption[] | undefined) => {
  if (!value || value.length === 0) {
    return "None specified";
  }

  const names = value
    .map((option) => option.name.trim())
    .filter((name) => name.length > 0);

  if (names.length === 0) {
    return "None specified";
  }

  return `Colors: ${names.join(", ")}`;
};

const normalizeUniqueCode = (value: string | null | undefined) => {
  if (!value) {
    return DEFAULT_CODE;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : DEFAULT_CODE;
};

export function FursuitCard({
  name,
  species,
  colors: colorOptions,
  avatarUrl,
  uniqueCode,
  timelineLabel,
  codeLabel = "Catch code",
  actionSlot,
  onPress,
  onCodeCopied,
}: FursuitCardProps) {
  const displaySpecies = normalizeSpecies(species);
  const displayColors = buildColorLine(colorOptions);
  const displayCode = normalizeUniqueCode(uniqueCode);

  const handleCodeLongPress = () => {
    // Copy the displayed code so users can share it quickly.
    void Clipboard.setStringAsync(displayCode);
    Alert.alert("Code copied", "The catch code is ready to paste.");
    if (onCodeCopied) {
      onCodeCopied();
    }
  };

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityHint={
        onPress ? "Opens detailed bio for this fursuit" : undefined
      }
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        onPress ? { opacity: pressed ? 0.92 : 1 } : null,
      ]}
    >
      <View style={styles.leadRow}>
        <View style={styles.avatarWrapper}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <Text style={styles.avatarFallback}>No avatar</Text>
          )}
        </View>
        <View style={styles.details}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.species} numberOfLines={1}>
            {displaySpecies}
          </Text>
          <Text style={styles.colors} numberOfLines={1}>
            {displayColors}
          </Text>
          {timelineLabel ? (
            <Text style={styles.timeline}>{timelineLabel}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.metaRow}>
        {codeLabel ? (
          <View style={styles.codeBlock}>
            <Text style={styles.codeLabel}>{codeLabel}</Text>
            <Pressable
              accessibilityHint="Copies the code to your clipboard"
              accessibilityRole="button"
              hitSlop={8}
              onLongPress={handleCodeLongPress}
            >
              <Text style={styles.codeValue}>{displayCode}</Text>
            </Pressable>
          </View>
        ) : null}
        {actionSlot ? (
          <View style={styles.actionSlot}>{actionSlot}</View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(15,23,42,0.85)",
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
    padding: IS_SMALL_SCREEN ? spacing.sm : spacing.md,
  },
  leadRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: IS_SMALL_SCREEN ? spacing.sm : spacing.md,
    marginBottom: IS_SMALL_SCREEN ? spacing.sm : spacing.md,
  },
  avatarWrapper: {
    width: "50%",
    aspectRatio: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(30,41,59,0.8)",
    overflow: "hidden",
  },
  avatar: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  avatarFallback: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "rgba(148,163,184,0.7)",
    textAlign: "center",
  },
  details: {
    flex: 1,
  },
  name: {
    color: colors.foreground,
    fontSize: IS_SMALL_SCREEN ? 16 : 18,
    fontWeight: "600",
    marginBottom: IS_SMALL_SCREEN ? 2 : 4,
  },
  species: {
    color: "rgba(203,213,225,0.9)",
    fontSize: IS_SMALL_SCREEN ? 13 : 14,
    marginBottom: IS_SMALL_SCREEN ? 2 : 4,
  },
  colors: {
    color: "rgba(148,163,184,0.9)",
    fontSize: IS_SMALL_SCREEN ? 12 : 13,
    marginBottom: IS_SMALL_SCREEN ? 2 : 4,
  },
  timeline: {
    color: "rgba(148,163,184,0.9)",
    fontSize: IS_SMALL_SCREEN ? 11 : 12,
  },
  metaRow: {
    flexDirection: IS_SMALL_SCREEN ? "column" : "row",
    alignItems: IS_SMALL_SCREEN ? "flex-start" : "center",
    justifyContent: "space-between",
    marginTop: IS_SMALL_SCREEN ? spacing.sm : spacing.md,
    gap: spacing.xs,
  },
  codeBlock: {
    flexDirection: "row",
    alignItems: "center",
    flex: IS_SMALL_SCREEN ? 0 : 1,
    minWidth: 0,
  },
  actionSlot: {
    flexShrink: 0,
    alignSelf: IS_SMALL_SCREEN ? "stretch" : "auto",
    width: IS_SMALL_SCREEN ? "100%" : "auto",
  },
  codeLabel: {
    fontSize: IS_SMALL_SCREEN ? 10 : 11,
    textTransform: "uppercase",
    letterSpacing: IS_SMALL_SCREEN ? 2 : 3,
    color: "rgba(148,163,184,0.9)",
    marginRight: spacing.xs,
  },
  codeValue: {
    fontFamily: "Courier",
    fontWeight: "600",
    color: "#38bdf8",
    fontSize: IS_SMALL_SCREEN ? 14 : 16,
    backgroundColor: "rgba(30,41,59,0.8)",
    paddingHorizontal: IS_SMALL_SCREEN ? spacing.xs : spacing.sm,
    paddingVertical: IS_SMALL_SCREEN ? 2 : 4,
    borderRadius: radius.md,
  },
});
