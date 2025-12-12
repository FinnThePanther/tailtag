import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';

import { TailTagCard } from '@/components/ui/TailTagCard';
import { TailTagButton } from '@/components/ui/TailTagButton';
import { colors, spacing } from '@/theme';

type LocationPermissionModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function LocationPermissionModal({ visible, onClose }: LocationPermissionModalProps) {
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
              <Ionicons name="location-outline" size={48} color={colors.primary} />
            </View>
            <Text style={styles.title}>Location permission required</Text>
            <Text style={styles.body}>
              TailTag needs your location once to verify you are at the convention. We do not track
              you during the event.
            </Text>

            <View style={styles.actions}>
              <TailTagButton onPress={openSettings}>
                Open Settings
              </TailTagButton>
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

async function openSettings() {
  await Linking.openSettings();
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
  actions: {
    gap: spacing.sm,
  },
});
