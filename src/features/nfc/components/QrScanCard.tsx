import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { TailTagCard } from '@/components/ui/TailTagCard';
import { TailTagButton } from '@/components/ui/TailTagButton';
import { colors, spacing, radius } from '@/theme';
import { captureHandledException } from '@/lib/sentry';
import {
  FursuitCard,
  FursuitBioDetails,
  fetchFursuitDetail,
  fursuitDetailQueryKey,
} from '@/features/suits';
import type { FursuitBio } from '@/features/suits';
import { parseTailTagQrPayload } from '../qrPayload';
import { lookupTagForCatch } from '../api/nfcTags';
import type { TagLookupFailReason } from '../types';

type ScanStep =
  | 'idle'
  | 'requesting_permission'
  | 'permission_denied'
  | 'scanning'
  | 'looking_up'
  | 'creating_catch'
  | 'success'
  | 'tag_not_found'
  | 'error';

type CatchStatusType = 'ACCEPTED' | 'PENDING' | 'REJECTED' | 'EXPIRED';

type QrCatchResult = {
  qrToken: string;
  fursuitId: string;
  catchId: string;
  catchNumber: number | null;
  status: CatchStatusType;
  requiresApproval: boolean;
};

type CreateCatchParams = {
  fursuitId: string;
  conventionId: string;
};

type CreateCatchResult = {
  catchId: string;
  catchNumber: number | null;
  status: CatchStatusType;
  requiresApproval: boolean;
};

type QrScanCardProps = {
  conventionId: string;
  onCatchComplete?: (result: QrCatchResult) => void;
  createCatchFn: (params: CreateCatchParams) => Promise<CreateCatchResult>;
};

const TAG_ERROR_MESSAGES: Record<TagLookupFailReason, string> = {
  TAG_NOT_REGISTERED: 'This QR code was not found. Ask the fursuiter to register first.',
  TAG_NOT_LINKED: 'This QR code is not linked to a fursuit.',
  TAG_LOST: 'The physical tag associated with this QR code was marked lost.',
  TAG_REVOKED: 'This QR code has been revoked by its owner.',
};

export function QrScanCard({ conventionId, onCatchComplete, createCatchFn }: QrScanCardProps) {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<ScanStep>('idle');
  const [qrResult, setQrResult] = useState<QrCatchResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scannedToken, setScannedToken] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: fursuitDetail, isLoading: isFursuitLoading } = useQuery({
    queryKey: fursuitDetailQueryKey(qrResult?.fursuitId ?? ''),
    queryFn: () => fetchFursuitDetail(qrResult!.fursuitId),
    enabled: Boolean(qrResult?.fursuitId) && step === 'success',
    staleTime: 2 * 60_000,
  });

  const conversationPrompt = useMemo(() => {
    const bio: FursuitBio | null | undefined = fursuitDetail?.bio;
    if (!bio) return null;
    return [bio.askMeAbout, bio.tagline, bio.funFact, bio.likesAndInterests]
      .map((value) => value?.trim())
      .find((value) => value);
  }, [fursuitDetail]);

  const permissionState: 'unknown' | 'granted' | 'undetermined' | 'denied' = permission
    ? permission.granted
      ? 'granted'
      : permission.canAskAgain
      ? 'undetermined'
      : 'denied'
    : 'unknown';

  const startScan = useCallback(async () => {
    setErrorMessage(null);
    if (permissionState === 'granted') {
      setStep('scanning');
      return;
    }

    setStep('requesting_permission');
    try {
      const response = await requestPermission();
      if (response?.granted) {
        setStep('scanning');
      } else {
        setStep('permission_denied');
      }
    } catch (error) {
      captureHandledException(error, {
        scope: 'qrScan.requestPermission',
      });
      setStep('permission_denied');
      setErrorMessage('We could not access the camera. Please try again.');
    }
  }, [permissionState, requestPermission]);

  const resetScanner = useCallback(() => {
    setStep('idle');
    setErrorMessage(null);
    setQrResult(null);
    setScannedToken(null);
    setIsProcessing(false);
  }, []);

  const handleBarCodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (isProcessing || step !== 'scanning') {
        return;
      }

      const parsed = parseTailTagQrPayload(data?.trim());
      if (!parsed) {
        setErrorMessage('That QR code is not from TailTag. Ask them to open the app and tap “Show My QR”.');
        setStep('error');
        return;
      }

      setIsProcessing(true);
      setScannedToken(parsed.token);
      setErrorMessage(null);
      setStep('looking_up');

      try {
        const lookupResult = await lookupTagForCatch({ qrToken: parsed.token });

        if (!lookupResult.found) {
          setStep('tag_not_found');
          setErrorMessage(TAG_ERROR_MESSAGES[lookupResult.reason]);
          setIsProcessing(false);
          return;
        }

        setStep('creating_catch');
        const result = await createCatchFn({
          fursuitId: lookupResult.fursuitId,
          conventionId,
        });

        const qrCatchResult: QrCatchResult = {
          qrToken: parsed.token,
          fursuitId: lookupResult.fursuitId,
          catchId: result.catchId,
          catchNumber: result.catchNumber,
          status: result.status,
          requiresApproval: result.requiresApproval,
        };

        setQrResult(qrCatchResult);
        setStep('success');
        setIsProcessing(false);
        onCatchComplete?.(qrCatchResult);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create catch';
        setErrorMessage(message);
        setStep('error');
        setIsProcessing(false);
        captureHandledException(error, {
          scope: 'qrScan.createCatch',
          qrToken: parsed.token,
        });
      }
    },
    [conventionId, createCatchFn, onCatchComplete, step, isProcessing],
  );

  if (step === 'requesting_permission') {
    return (
      <TailTagCard style={styles.card}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.body}>Requesting camera access…</Text>
      </TailTagCard>
    );
  }

  if (step === 'permission_denied' || permissionState === 'denied') {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="camera-outline" size={48} color={colors.amber} />
        </View>
        <Text style={styles.title}>Camera permission needed</Text>
        <Text style={styles.body}>
          Enable camera permissions for TailTag to scan QR backups.
        </Text>
        <TailTagButton onPress={startScan} style={styles.button}>
          Try again
        </TailTagButton>
      </TailTagCard>
    );
  }

  if (step === 'looking_up' || step === 'creating_catch') {
    const message =
      step === 'looking_up'
        ? { title: 'Looking up QR code…', body: 'Finding the linked fursuit.' }
        : { title: 'Recording catch…', body: 'Almost there!' };

    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Text style={styles.title}>{message.title}</Text>
        <Text style={styles.body}>{message.body}</Text>
      </TailTagCard>
    );
  }

  if (step === 'success' && qrResult) {
    return (
      <TailTagCard style={qrResult.requiresApproval ? [styles.card, styles.pendingCard] : [styles.card, styles.successCard]}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={qrResult.requiresApproval ? 'time-outline' : 'qr-code-outline'}
            size={48}
            color={qrResult.requiresApproval ? colors.amber : colors.primary}
          />
        </View>
        <Text style={styles.title}>
          {qrResult.requiresApproval ? 'Catch pending approval' : 'QR catch logged'}
        </Text>
        {qrResult.catchNumber && !qrResult.requiresApproval ? (
          <Text style={styles.catchNumber}>You were catcher #{qrResult.catchNumber}</Text>
        ) : null}
        <Text style={styles.body}>
          {qrResult.requiresApproval
            ? 'The owner will be notified. Your catch will count once they approve it.'
            : fursuitDetail
              ? `You just tagged ${fursuitDetail.name}. Check out their bio below!`
              : 'Catch logged successfully.'}
        </Text>

        {conversationPrompt ? (
          <TailTagCard style={qrResult.requiresApproval ? styles.pendingPromptCard : styles.promptCard}>
            <Text style={qrResult.requiresApproval ? styles.pendingPromptLabel : styles.promptLabel}>Ask them about…</Text>
            <Text style={styles.promptBody}>{conversationPrompt}</Text>
          </TailTagCard>
        ) : null}

        {isFursuitLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Loading suit details…</Text>
          </View>
        ) : fursuitDetail ? (
          <View style={qrResult.requiresApproval ? styles.pendingFursuitBorder : styles.fursuitCardWrapper}>
            <FursuitCard
              name={fursuitDetail.name}
              species={fursuitDetail.species}
              colors={fursuitDetail.colors}
              avatarUrl={fursuitDetail.avatar_url}
              uniqueCode={fursuitDetail.unique_code}
              timelineLabel="Caught just now"
              onPress={() =>
                router.push({
                  pathname: '/fursuits/[id]',
                  params: { id: fursuitDetail.id },
                })
              }
            />
          </View>
        ) : null}

        {fursuitDetail?.bio ? (
          <View style={styles.bioSpacing}>
            <FursuitBioDetails bio={fursuitDetail.bio} />
          </View>
        ) : null}

        <View style={styles.buttonRow}>
          <TailTagButton variant="outline" onPress={() => router.push('/caught')} style={styles.button}>
            View catches
          </TailTagButton>
          <TailTagButton variant="ghost" onPress={resetScanner} style={styles.button}>
            Scan another
          </TailTagButton>
        </View>
      </TailTagCard>
    );
  }

  if (step === 'tag_not_found') {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name='help-circle-outline' size={48} color={colors.amber} />
        </View>
        <Text style={styles.title}>QR not found</Text>
        <Text style={styles.body}>{errorMessage ?? 'This QR code is not linked to any fursuit.'}</Text>
        <TailTagButton onPress={resetScanner} style={styles.button}>
          Scan again
        </TailTagButton>
      </TailTagCard>
    );
  }

  if (step === 'error' && errorMessage) {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name='close-circle' size={48} color={colors.destructive} />
        </View>
        <Text style={styles.title}>Scan failed</Text>
        <Text style={styles.body}>{errorMessage}</Text>
        <TailTagButton onPress={resetScanner} style={styles.button}>
          Try again
        </TailTagButton>
      </TailTagCard>
    );
  }

  if (step === 'scanning' && permissionState === 'granted') {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.scannerFrame}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarCodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <Text style={styles.scannerText}>Align the TailTag QR inside the square</Text>
          </View>
        </View>
        <TailTagButton variant="outline" onPress={resetScanner} style={styles.button}>
          Stop scanning
        </TailTagButton>
      </TailTagCard>
    );
  }

  return (
    <TailTagCard style={styles.card}>
      <View style={styles.iconContainer}>
        <Ionicons name='qr-code-outline' size={48} color={colors.primary} />
      </View>
      <Text style={styles.title}>Scan QR backup</Text>
      <Text style={styles.body}>
        Ask the fursuiter to tap “Show My QR” in the TailTag app, then scan it here.
      </Text>
      <TailTagButton onPress={startScan} style={styles.button}>
        Start QR scan
      </TailTagButton>
    </TailTagCard>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  iconContainer: {
    marginBottom: spacing.md,
    alignItems: 'center',
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
  scannerFrame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(148,163,184,0.3)',
    marginBottom: spacing.md,
  },
  scannerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scannerText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
  },
  successCard: {
    alignItems: 'stretch',
    width: '100%',
  },
  pendingCard: {
    borderColor: colors.amber,
    borderWidth: 2,
    width: '100%',
  },
  catchNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  promptCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryDark,
    width: '100%',
  },
  pendingPromptCard: {
    marginBottom: spacing.md,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
    width: '100%',
  },
  promptLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.primary,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  pendingPromptLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.amber,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  promptBody: {
    fontSize: 16,
    color: colors.foreground,
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: 'column',
    marginTop: spacing.md,
    gap: spacing.sm,
    width: '100%',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  loadingText: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  bioSpacing: {
    marginTop: spacing.md,
  },
  fursuitCardWrapper: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  pendingFursuitBorder: {
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.amber,
    overflow: 'hidden',
  },
});
