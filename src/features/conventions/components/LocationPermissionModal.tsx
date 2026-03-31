import { Modal, Pressable, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';

import { TailTagCard } from '@/components/ui/TailTagCard';
import { TailTagButton } from '@/components/ui/TailTagButton';
import { colors } from '@/theme';
import { styles } from './LocationPermissionModal.styles';

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
