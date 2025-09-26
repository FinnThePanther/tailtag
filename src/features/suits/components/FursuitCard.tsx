import type { ReactNode } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { colors, radius, spacing } from '../../../theme';

const DEFAULT_SPECIES = 'Species not set yet';
const DEFAULT_CODE = 'Pending code';

type FursuitCardProps = {
  name: string;
  species?: string | null;
  avatarUrl?: string | null;
  uniqueCode?: string | null;
  timelineLabel?: string | null;
  codeLabel?: string;
  actionSlot?: ReactNode;
};

const normalizeSpecies = (value: string | null | undefined) => {
  if (!value) {
    return DEFAULT_SPECIES;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_SPECIES;
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
  avatarUrl,
  uniqueCode,
  timelineLabel,
  codeLabel = 'Catch code',
  actionSlot,
}: FursuitCardProps) {
  const displaySpecies = normalizeSpecies(species);
  const displayCode = normalizeUniqueCode(uniqueCode);

  const handleCodeLongPress = () => {
    // Copy the displayed code so users can share it quickly.
    void Clipboard.setStringAsync(displayCode);
    Alert.alert('Code copied', 'The catch code is ready to paste.');
  };

  return (
    <View style={styles.container}>
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
          {timelineLabel ? (
            <Text style={styles.timeline} numberOfLines={1}>
              {timelineLabel}
            </Text>
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
        {actionSlot ? <View>{actionSlot}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    padding: spacing.md,
  },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarWrapper: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,41,59,0.8)',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarFallback: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: 'rgba(148,163,184,0.7)',
    textAlign: 'center',
  },
  details: {
    flex: 1,
    marginLeft: spacing.md,
  },
  name: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  species: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
    marginBottom: 4,
  },
  timeline: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  codeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  codeLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 3,
    color: 'rgba(148,163,184,0.9)',
    marginRight: spacing.xs,
  },
  codeValue: {
    fontFamily: 'Courier',
    fontWeight: '600',
    color: '#38bdf8',
    fontSize: 16,
    backgroundColor: 'rgba(30,41,59,0.8)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
});
