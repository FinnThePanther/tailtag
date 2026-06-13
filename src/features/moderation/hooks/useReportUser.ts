import { useMutation } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { submitReport } from '../api/reports';
import type { ReportInput } from '../types';
import { getUserVisibleErrorMessage } from '../../../lib/userVisibleErrors';

export function useReportUser() {
  return useMutation({
    mutationFn: (input: ReportInput) => submitReport(input),
    onSuccess: () => {
      Alert.alert('Report submitted', 'Thank you. Our moderation team will review your report.');
    },
    onError: (error: Error) => {
      Alert.alert(
        'Could not submit report',
        getUserVisibleErrorMessage(error, 'We could not submit that report. Please try again.'),
      );
    },
  });
}
