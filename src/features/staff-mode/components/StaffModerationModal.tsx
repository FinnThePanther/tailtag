import { Modal, Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardProvider } from 'react-native-keyboard-controller';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagInput } from '../../../components/ui/TailTagInput';
import { spacing } from '../../../theme';
import { styles } from './StaffModerationModal.styles';

type ModerationAction = 'ban' | 'unban';

type StaffModerationModalProps = {
  visible: boolean;
  action: ModerationAction | null;
  username: string | null;
  reason: string;
  error: string | null;
  isSubmitting: boolean;
  onChangeReason: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function StaffModerationModal({
  visible,
  action,
  username,
  reason,
  error,
  isSubmitting,
  onChangeReason,
  onClose,
  onSubmit,
}: StaffModerationModalProps) {
  if (!action) {
    return null;
  }

  const trimmedReason = reason.trim();
  const title = `${action === 'ban' ? 'Ban' : 'Unban'} ${username ?? 'user'}`;
  const description =
    action === 'ban' ? 'Enter a reason for the ban.' : 'Enter a reason for lifting the ban.';
  const submitLabel = action === 'ban' ? 'Ban' : 'Unban';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardProvider>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            bottomOffset={spacing.xl}
          >
            <Text style={styles.description}>{description}</Text>
            <Text style={styles.label}>Reason</Text>
            <TailTagInput
              value={reason}
              onChangeText={onChangeReason}
              placeholder="Add a clear internal reason"
              multiline
              numberOfLines={5}
              style={styles.input}
              editable={!isSubmitting}
              autoFocus
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TailTagButton
              onPress={onSubmit}
              loading={isSubmitting}
              disabled={isSubmitting || trimmedReason.length === 0}
              variant={action === 'ban' ? 'destructive' : 'primary'}
            >
              {submitLabel}
            </TailTagButton>
          </KeyboardAwareScrollView>
        </View>
      </KeyboardProvider>
    </Modal>
  );
}
