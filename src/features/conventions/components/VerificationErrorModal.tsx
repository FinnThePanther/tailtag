import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { TailTagCard } from '@/components/ui/TailTagCard';
import { TailTagButton } from '@/components/ui/TailTagButton';
import { colors } from '@/theme';
import type { ConventionSummary } from '../api/conventions';
import { styles } from './VerificationErrorModal.styles';

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
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
      >
        <Pressable
          style={styles.cardWrapper}
          onPress={(event) => event.stopPropagation()}
        >
          <TailTagCard>
            <View style={styles.iconRow}>
              <Ionicons
                name="warning-outline"
                size={48}
                color={colors.destructive}
              />
            </View>
            <Text style={styles.title}>Couldn&apos;t verify location</Text>
            <Text style={styles.body}>{error ?? 'You must be at the convention to play.'}</Text>

            <View style={styles.conventionInfo}>
              <Text style={styles.conventionName}>{convention.name}</Text>
              {convention.location ? (
                <Text style={styles.conventionLocation}>{convention.location}</Text>
              ) : null}
            </View>

            <View style={styles.actions}>
              <TailTagButton onPress={onRetry}>Try again</TailTagButton>
              <TailTagButton
                variant="ghost"
                onPress={onClose}
              >
                Cancel
              </TailTagButton>
            </View>
          </TailTagCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
