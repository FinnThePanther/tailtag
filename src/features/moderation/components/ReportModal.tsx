import { useState } from 'react';
import {
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagInput } from '../../../components/ui/TailTagInput';
import { spacing } from '../../../theme';
import { useReportUser } from '../hooks/useReportUser';
import { REPORT_TYPE_LABELS, type ReportType } from '../types';
import { styles } from './ReportModal.styles';

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
