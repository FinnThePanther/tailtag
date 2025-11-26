import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TailTagButton } from '@/components/ui/TailTagButton';
import { TailTagCard } from '@/components/ui/TailTagCard';
import { colors, spacing, radius } from '@/theme';
import { useTagRegistration } from '../hooks/useTagRegistration';

type TagRegistrationFlowProps = {
  fursuitId: string;
  fursuitName: string;
  onComplete?: () => void;
  onCancel?: () => void;
};

/**
 * Full registration flow component for the tag management screen.
 * Handles all states: scanning, checking, registering, linking, success, errors.
 */
export function TagRegistrationFlow({
  fursuitId,
  fursuitName,
  onComplete,
  onCancel,
}: TagRegistrationFlowProps) {
  const {
    step,
    scannedUid,
    error,
    supportStatus,
    isProcessing,
    startRegistration,
    reset,
    cancelScan,
  } = useTagRegistration(fursuitId);

  const handleComplete = () => {
    reset();
    onComplete?.();
  };

  const handleCancel = () => {
    if (step === 'scanning') {
      cancelScan();
    } else {
      reset();
    }
    onCancel?.();
  };

  // NFC not supported
  if (supportStatus === 'unsupported') {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="warning-outline" size={48} color={colors.amber} />
        </View>
        <Text style={styles.title}>NFC Not Available</Text>
        <Text style={styles.body}>
          This device does not support NFC. You cannot register NFC tags on this
          device.
        </Text>
        <TailTagButton variant="outline" onPress={onCancel} style={styles.button}>
          Go Back
        </TailTagButton>
      </TailTagCard>
    );
  }

  // NFC disabled
  if (supportStatus === 'disabled') {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="settings-outline" size={48} color={colors.amber} />
        </View>
        <Text style={styles.title}>NFC Disabled</Text>
        <Text style={styles.body}>
          Please enable NFC in your device settings to register tags.
        </Text>
        <TailTagButton variant="outline" onPress={onCancel} style={styles.button}>
          Go Back
        </TailTagButton>
      </TailTagCard>
    );
  }

  // Checking NFC support
  if (supportStatus === 'checking') {
    return (
      <TailTagCard style={styles.card}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.body}>Checking NFC availability...</Text>
      </TailTagCard>
    );
  }

  // Complete state
  if (step === 'complete') {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={64} color={colors.primary} />
        </View>
        <Text style={styles.title}>Tag Registered!</Text>

        {scannedUid && (
          <View style={styles.debugContainer}>
            <Text style={styles.debugLabel}>Tag UID</Text>
            <Text style={styles.debugValue}>{scannedUid}</Text>
          </View>
        )}

        <Text style={styles.body}>
          This NFC tag is now linked to {fursuitName}. Others can tap it to catch
          you!
        </Text>

        <TailTagButton onPress={handleComplete} style={styles.button}>
          Done
        </TailTagButton>
      </TailTagCard>
    );
  }

  // Conflict state - tag belongs to another user
  if (step === 'conflict') {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="alert-circle" size={48} color={colors.destructive} />
        </View>
        <Text style={styles.title}>Tag Already Registered</Text>
        <Text style={styles.body}>
          This tag is registered to another user. If you believe this is a
          mistake, please contact support.
        </Text>
        <TailTagButton onPress={reset} style={styles.button}>
          Try Another Tag
        </TailTagButton>
        <TailTagButton variant="ghost" onPress={handleCancel} style={styles.button}>
          Cancel
        </TailTagButton>
      </TailTagCard>
    );
  }

  // Error state
  if (step === 'error' && error) {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="close-circle" size={48} color={colors.destructive} />
        </View>
        <Text style={styles.title}>Registration Failed</Text>
        <Text style={styles.body}>{error.message}</Text>
        <TailTagButton onPress={reset} style={styles.button}>
          Try Again
        </TailTagButton>
        <TailTagButton variant="ghost" onPress={handleCancel} style={styles.button}>
          Cancel
        </TailTagButton>
      </TailTagCard>
    );
  }

  // Processing states (scanning, checking, registering, linking)
  if (isProcessing) {
    const stepMessages: Record<string, { title: string; body: string }> = {
      scanning: {
        title: 'Ready to Scan',
        body: 'Hold your device near the NFC tag you want to register.',
      },
      checking: {
        title: 'Checking Tag...',
        body: 'Verifying tag status with the server.',
      },
      registering: {
        title: 'Registering Tag...',
        body: 'Creating your tag registration.',
      },
      linking: {
        title: 'Linking Tag...',
        body: `Connecting tag to ${fursuitName}.`,
      },
    };

    const message = stepMessages[step] ?? stepMessages.scanning;

    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          {step === 'scanning' ? (
            <Ionicons name="radio-outline" size={48} color={colors.primary} />
          ) : (
            <ActivityIndicator size="large" color={colors.primary} />
          )}
        </View>
        <Text style={styles.title}>{message.title}</Text>
        <Text style={styles.body}>{message.body}</Text>

        {step === 'scanning' && (
          <TailTagButton variant="outline" onPress={cancelScan} style={styles.button}>
            Cancel
          </TailTagButton>
        )}
      </TailTagCard>
    );
  }

  // Idle state - ready to start
  return (
    <TailTagCard style={styles.card}>
      <View style={styles.iconContainer}>
        <Ionicons name="radio-outline" size={48} color={colors.primary} />
      </View>
      <Text style={styles.title}>Register NFC Tag</Text>
      <Text style={styles.body}>
        Tap the button below to scan an NFC tag and link it to {fursuitName}.
        Once linked, others can tap your tag to catch you!
      </Text>
      <TailTagButton onPress={startRegistration} style={styles.button}>
        Scan Tag to Register
      </TailTagButton>
      <TailTagButton variant="ghost" onPress={handleCancel} style={styles.button}>
        Cancel
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
    lineHeight: 20,
  },
  button: {
    width: '100%',
    marginTop: spacing.xs,
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
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: colors.foreground,
    letterSpacing: 1,
  },
});
