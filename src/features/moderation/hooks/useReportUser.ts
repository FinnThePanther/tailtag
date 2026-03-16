import { useMutation } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { submitReport } from '../api/reports';
import type { ReportInput } from '../types';

export function useReportUser() {
  return useMutation({
    mutationFn: (input: ReportInput) => submitReport(input),
    onSuccess: () => {
      Alert.alert('Report submitted', 'Thank you. Our moderation team will review your report.');
    },
    onError: (error: Error) => {
      Alert.alert('Could not submit report', error.message);
    },
  });
}
