import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TailTagButton } from '@/components/ui/TailTagButton';
import { TailTagCard } from '@/components/ui/TailTagCard';
import { colors, spacing, radius } from '@/theme';
import { useNfcScanner } from '../hooks/useNfcScanner';
import { emitNfcScan } from '../api/nfc';

type NfcScanCardProps = {
  conventionId: string;
  onScanComplete?: (result: { tagUid: string; eventId: string | null }) => void;
};

export function NfcScanCard({ conventionId, onScanComplete }: NfcScanCardProps) {
  const {
    supportStatus,
    scanState,
    lastScan,
    error,
    startScan,
    cancelScan,
    resetState,
    isScanning,
  } = useNfcScanner();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    setSubmissionError(null);
    const result = await startScan();

    if (result) {
      setIsSubmitting(true);
      const emitResult = await emitNfcScan({
        tagUid: result.tagUid,
        conventionId,
      });
      setIsSubmitting(false);

      if (emitResult) {
        onScanComplete?.({ tagUid: result.tagUid, eventId: emitResult.eventId });
      } else {
        setSubmissionError('Scan recorded locally but sync failed.');
        onScanComplete?.({ tagUid: result.tagUid, eventId: null });
      }
    }
  }, [startScan, conventionId, onScanComplete]);

  const handleScanAnother = useCallback(() => {
    resetState();
    setSubmissionError(null);
  }, [resetState]);

  // Unsupported state
  if (supportStatus === 'unsupported') {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="warning-outline" size={48} color={colors.amber} />
        </View>
        <Text style={styles.title}>NFC Not Available</Text>
        <Text style={styles.body}>
          This device does not support NFC scanning. Use the code entry below
          instead.
        </Text>
      </TailTagCard>
    );
  }

  // Disabled state (Android)
  if (supportStatus === 'disabled') {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="settings-outline" size={48} color={colors.amber} />
        </View>
        <Text style={styles.title}>NFC Disabled</Text>
        <Text style={styles.body}>
          Please enable NFC in your device settings to scan TailTags.
        </Text>
      </TailTagCard>
    );
  }

  // Checking state
  if (supportStatus === 'checking') {
    return (
      <TailTagCard style={styles.card}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.body}>Checking NFC availability...</Text>
      </TailTagCard>
    );
  }

  // Success state with debug info
  if (lastScan && scanState === 'success') {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
        </View>
        <Text style={styles.title}>Tag Scanned!</Text>

        {/* Debug info for Phase 1 */}
        <View style={styles.debugContainer}>
          <Text style={styles.debugLabel}>Tag UID</Text>
          <Text style={styles.debugValue}>{lastScan.tagUid}</Text>
        </View>

        {submissionError && (
          <View style={styles.warningContainer}>
            <Ionicons name="alert-circle" size={18} color={colors.amber} />
            <Text style={styles.warningText}>{submissionError}</Text>
          </View>
        )}

        <Text style={styles.body}>
          Tag scanned successfully. In future versions, this will look up the
          linked fursuit.
        </Text>

        <TailTagButton onPress={handleScanAnother} style={styles.button}>
          Scan Another Tag
        </TailTagButton>
      </TailTagCard>
    );
  }

  // Scanning state
  if (isScanning || isSubmitting) {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Text style={styles.title}>
          {isSubmitting ? 'Recording Scan...' : 'Ready to Scan'}
        </Text>
        <Text style={styles.body}>
          {isSubmitting
            ? 'Sending scan to server...'
            : 'Hold your device near a TailTag to scan it.'}
        </Text>
        {!isSubmitting && (
          <TailTagButton
            variant="outline"
            onPress={cancelScan}
            style={styles.button}
          >
            Cancel
          </TailTagButton>
        )}
      </TailTagCard>
    );
  }

  // Error state
  if (error && scanState === 'error') {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="close-circle" size={48} color={colors.destructive} />
        </View>
        <Text style={styles.title}>Scan Failed</Text>
        <Text style={styles.body}>{error.message}</Text>
        <TailTagButton onPress={handleScan} style={styles.button}>
          Try Again
        </TailTagButton>
      </TailTagCard>
    );
  }

  // Idle state (ready to scan)
  return (
    <TailTagCard style={styles.card}>
      <View style={styles.iconContainer}>
        <Ionicons name="radio-outline" size={48} color={colors.primary} />
      </View>
      <Text style={styles.title}>NFC Scan</Text>
      <Text style={styles.body}>
        Tap the button below, then hold your device near a TailTag to scan it.
      </Text>
      <TailTagButton onPress={handleScan} style={styles.button}>
        Start NFC Scan
      </TailTagButton>
    </TailTagCard>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  iconContainer: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: 'rgba(203,213,225,0.9)',
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  button: {
    width: '100%',
  },
  debugContainer: {
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  debugLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  debugValue: {
    fontSize: 18,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: colors.foreground,
    letterSpacing: 2,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    width: '100%',
  },
  warningText: {
    color: colors.amber,
    fontSize: 14,
    flex: 1,
  },
});
