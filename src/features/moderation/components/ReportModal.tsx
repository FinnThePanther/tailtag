import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagInput } from '../../../components/ui/TailTagInput';
import { colors, spacing, radius } from '../../../theme';
import { useReportUser } from '../hooks/useReportUser';
import { REPORT_TYPE_LABELS, type ReportType } from '../types';

type ReportModalProps = {
  visible: boolean;
  onClose: () => void;
  reportedUserId?: string;
  reportedFursuitId?: string;
};

const REPORT_TYPES: ReportType[] = [
  'inappropriate_conduct',
  'harassment',
  'inappropriate_content',
  'cheating',
  'impersonation',
  'other',
];

export function ReportModal({
  visible,
  onClose,
  reportedUserId,
  reportedFursuitId,
}: ReportModalProps) {
  const [selectedType, setSelectedType] = useState<ReportType>('inappropriate_conduct');
  const [description, setDescription] = useState('');
  const reportMutation = useReportUser();

  const handleSubmit = () => {
    reportMutation.mutate(
      {
        reportedUserId,
        reportedFursuitId,
        reportType: selectedType,
        description: description.trim(),
      },
      {
        onSuccess: () => {
          setSelectedType('inappropriate_conduct');
          setDescription('');
          onClose();
        },
      },
    );
  };

  const handleClose = () => {
    setSelectedType('inappropriate_conduct');
    setDescription('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardProvider>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Report</Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            bottomOffset={spacing.xl}
          >
            <Text style={styles.label}>What are you reporting?</Text>
            <View style={styles.typeList}>
              {REPORT_TYPES.map((type) => (
                <Pressable
                  key={type}
                  style={[
                    styles.typeOption,
                    selectedType === type && styles.typeOptionSelected,
                  ]}
                  onPress={() => setSelectedType(type)}
                >
                  <Text
                    style={[
                      styles.typeOptionText,
                      selectedType === type && styles.typeOptionTextSelected,
                    ]}
                  >
                    {REPORT_TYPE_LABELS[type]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Description (optional)</Text>
            <TailTagInput
              value={description}
              onChangeText={setDescription}
              placeholder="Tell us more about what happened..."
              multiline
              numberOfLines={4}
              style={styles.descriptionInput}
            />

            <TailTagButton
              onPress={handleSubmit}
              loading={reportMutation.isPending}
              disabled={reportMutation.isPending}
            >
              Submit report
            </TailTagButton>
          </KeyboardAwareScrollView>
        </View>
      </KeyboardProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.2)',
  },
  title: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '600',
  },
  cancelText: {
    color: colors.primary,
    fontSize: 16,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  label: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  typeList: {
    gap: spacing.sm,
  },
  typeOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  typeOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  typeOptionText: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 15,
  },
  typeOptionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
