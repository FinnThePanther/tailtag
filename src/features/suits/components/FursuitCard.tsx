import type { ReactNode } from "react";
import {
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";

import { AppImage } from "../../../components/ui/AppImage";
import type { FursuitColorOption } from "../../colors";
import { FURSUIT_CARD_IMAGE_SIZE, styles } from "./FursuitCard.styles";

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
            <AppImage
              url={avatarUrl}
              width={FURSUIT_CARD_IMAGE_SIZE}
              height={FURSUIT_CARD_IMAGE_SIZE}
              style={styles.avatar}
            />
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
