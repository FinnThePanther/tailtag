import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { TailTagCard } from '@/components/ui/TailTagCard';
import { TailTagButton } from '@/components/ui/TailTagButton';
import { colors, spacing } from '@/theme';
import type { ConventionSummary } from '../api/conventions';

type VerificationErrorModalProps = {
  visible: boolean;
  error: string | null;
  convention: ConventionSummary;
  onClose: () => void;
  onRetry: () => void;
};

export function VerificationErrorModal({
  visible,
  error,
  convention,
  onClose,
  onRetry,
}: VerificationErrorModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.cardWrapper} onPress={(event) => event.stopPropagation()}>
          <TailTagCard>
            <View style={styles.iconRow}>
              <Ionicons name="warning-outline" size={48} color={colors.error} />
            </View>
            <Text style={styles.title}>Couldn&apos;t verify location</Text>
            <Text style={styles.body}>{error ?? 'You must be at the convention to join.'}</Text>

            <View style={styles.conventionInfo}>
              <Text style={styles.conventionName}>{convention.name}</Text>
              {convention.location ? (
                <Text style={styles.conventionLocation}>{convention.location}</Text>
              ) : null}
            </View>

            <View style={styles.actions}>
              <TailTagButton onPress={onRetry}>Try again</TailTagButton>
              <TailTagButton variant="ghost" onPress={onClose}>
                Cancel
              </TailTagButton>
            </View>
          </TailTagCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  cardWrapper: {
    width: '100%',
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  body: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  conventionInfo: {
    alignItems: 'center',
    gap: 2,
    marginBottom: spacing.md,
  },
  conventionName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '700',
  },
  conventionLocation: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
  },
  actions: {
    gap: spacing.sm,
  },
});
