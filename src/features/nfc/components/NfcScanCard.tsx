import { useState, useCallback } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { TailTagButton } from '@/components/ui/TailTagButton';
import { TailTagCard } from '@/components/ui/TailTagCard';
import { colors } from '@/theme';
import { captureNonCriticalError } from '@/lib/sentry';
import {
  FursuitCard,
  FursuitBioDetails,
  fetchFursuitDetail,
  fursuitDetailQueryKey,
} from '@/features/suits';
import { useNfcScanner } from '../hooks/useNfcScanner';
import { emitNfcScan } from '../api/nfc';
import { lookupTagForCatch } from '../api/nfcTags';
import type { TagLookupFailReason } from '../types';
import { styles } from './NfcScanCard.styles';

type ScanStep =
  | 'idle'
  | 'scanning'
  | 'looking_up'
  | 'creating_catch'
  | 'success'
  | 'tag_not_found'
  | 'error';

type CatchStatusType = 'ACCEPTED' | 'PENDING' | 'REJECTED' | 'EXPIRED';

type NfcCatchResult = {
  tagUid: string;
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

type NfcScanCardProps = {
  conventionId: string;
  onScanComplete?: (result: { tagUid: string; eventId: string | null }) => void;
  onCatchComplete?: (result: NfcCatchResult) => void;
  createCatchFn?: (params: CreateCatchParams) => Promise<CreateCatchResult>;
};

const TAG_ERROR_MESSAGES: Record<TagLookupFailReason, string> = {
  TAG_NOT_REGISTERED: 'This tag is not registered. Ask the fursuiter to register their tag first.',
  TAG_NOT_LINKED: 'This tag is registered but not linked to a fursuit yet.',
  TAG_LOST: 'This tag has been marked as lost by its owner.',
  TAG_REVOKED: 'This tag has been unlinked by its owner.',
};

export function NfcScanCard({
  conventionId,
  onScanComplete,
  onCatchComplete,
  createCatchFn,
}: NfcScanCardProps) {
  const router = useRouter();
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

  const [step, setStep] = useState<ScanStep>('idle');
  const [catchResult, setCatchResult] = useState<NfcCatchResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch fursuit details when we have a successful catch
  const { data: fursuitDetail, isLoading: isFursuitLoading } = useQuery({
    queryKey: fursuitDetailQueryKey(catchResult?.fursuitId ?? ''),
    queryFn: () => fetchFursuitDetail(catchResult!.fursuitId),
    enabled: Boolean(catchResult?.fursuitId) && step === 'success',
    staleTime: 2 * 60_000,
  });

  const handleReset = useCallback(() => {
    resetState();
    setStep('idle');
    setCatchResult(null);
    setErrorMessage(null);
  }, [resetState]);

  const handleScan = useCallback(async () => {
    setErrorMessage(null);
    setCatchResult(null);
    setStep('scanning');

    const scanResult = await startScan();

    if (!scanResult) {
      // Scan cancelled or failed - scanner hook sets error
      if (error) {
        setStep('error');
        setErrorMessage(error.message);
      } else {
        setStep('idle');
      }
      return;
    }

    const tagUid = scanResult.tagUid;

    // Always emit the scan event for tracking
    void emitNfcScan({ tagUid, conventionId }).catch((err) => {
      captureNonCriticalError(err, {
        scope: 'nfc.emitNfcScan',
        conventionId,
        hasTagUid: true,
      });
    });

    // If no createCatchFn is provided, just show the old Phase 1 behavior
    if (!createCatchFn) {
      onScanComplete?.({ tagUid, eventId: null });
      setStep('success');
      return;
    }

    // Look up the tag to get fursuit ID
    setStep('looking_up');

    const lookupResult = await lookupTagForCatch(tagUid);

    if (!lookupResult.found) {
      setStep('tag_not_found');
      setErrorMessage(TAG_ERROR_MESSAGES[lookupResult.reason]);
      onScanComplete?.({ tagUid, eventId: null });
      return;
    }

    // Create the catch
    setStep('creating_catch');

    try {
      const result = await createCatchFn({
        fursuitId: lookupResult.fursuitId,
        conventionId,
      });

      const nfcCatchResult: NfcCatchResult = {
        tagUid,
        fursuitId: lookupResult.fursuitId,
        catchId: result.catchId,
        catchNumber: result.catchNumber,
        status: result.status,
        requiresApproval: result.requiresApproval,
      };

      setCatchResult(nfcCatchResult);
      setStep('success');
      onCatchComplete?.(nfcCatchResult);
    } catch (catchError) {
      const message = catchError instanceof Error ? catchError.message : 'Failed to create catch';
      setStep('error');
      setErrorMessage(message);
      captureNonCriticalError(catchError, {
        scope: 'nfc.createCatch',
        fursuitId: lookupResult.fursuitId,
        conventionId,
        hasTagUid: true,
      });
    }
  }, [startScan, conventionId, createCatchFn, onScanComplete, onCatchComplete, error]);

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

  // Processing states (scanning, looking up, creating catch) - check FIRST before success
  // This ensures we show loading states even if scanState from hook is 'success'
  if (step === 'looking_up' || step === 'creating_catch') {
    const stepMessages: Record<string, { title: string; body: string }> = {
      looking_up: {
        title: 'Looking Up Tag...',
        body: 'Finding the linked fursuit.',
      },
      creating_catch: {
        title: 'Recording Catch...',
        body: 'Almost there!',
      },
    };

    const message = stepMessages[step];

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

  // Success state with catch result
  if (step === 'success' && catchResult) {
    // Derive conversation prompt from bio
    const conversationPrompt = fursuitDetail?.bio
      ? [
          fursuitDetail.bio.askMeAbout,
          fursuitDetail.bio.likesAndInterests,
        ]
          .map((value) => value?.trim())
          .find((value) => value)
      : null;

    return (
      <TailTagCard style={catchResult.requiresApproval ? [styles.card, styles.pendingCard] : [styles.card, styles.successCard]}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={catchResult.requiresApproval ? 'time-outline' : 'checkmark-circle'}
            size={48}
            color={catchResult.requiresApproval ? colors.amber : colors.primary}
          />
        </View>
        <Text style={styles.title}>
          {catchResult.requiresApproval ? 'Catch Pending!' : 'Nice catch!'}
        </Text>

        {catchResult.catchNumber && !catchResult.requiresApproval && (
          <Text style={styles.catchNumber}>
            You were catcher #{catchResult.catchNumber}
          </Text>
        )}

        <Text style={styles.body}>
          {catchResult.requiresApproval
            ? 'The owner will be notified. Your catch will count once approved.'
            : fursuitDetail
              ? `You just tagged ${fursuitDetail.name}. Check out their bio below!`
              : 'Successfully caught this fursuit via NFC!'}
        </Text>

        {/* Conversation prompt card */}
        {conversationPrompt && (
          <TailTagCard style={catchResult.requiresApproval ? styles.pendingPromptCard : styles.promptCard}>
            <Text style={catchResult.requiresApproval ? styles.pendingPromptLabel : styles.promptLabel}>
              Ask them about…
            </Text>
            <Text style={styles.promptBody}>{conversationPrompt}</Text>
          </TailTagCard>
        )}

        {/* Fursuit card with details */}
        {isFursuitLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Loading fursuit details...</Text>
          </View>
        ) : fursuitDetail ? (
          <View style={catchResult.requiresApproval ? styles.pendingFursuitBorder : styles.fursuitCardWrapper}>
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

        {/* Bio details */}
        {fursuitDetail?.bio && (
          <View style={styles.bioSpacing}>
            <FursuitBioDetails bio={fursuitDetail.bio} />
          </View>
        )}

        <View style={styles.buttonRow}>
          <TailTagButton
            variant="outline"
            onPress={() => router.push('/caught')}
            style={styles.button}
          >
            View catches
          </TailTagButton>
          <TailTagButton
            variant="ghost"
            onPress={handleReset}
            style={styles.button}
          >
            Scan another
          </TailTagButton>
        </View>
      </TailTagCard>
    );
  }

  // Success state without catch (only shown if no createCatchFn provided)
  // This shouldn't happen in normal flow since we always pass createCatchFn
  if ((step === 'success' || scanState === 'success') && lastScan && !catchResult && !createCatchFn) {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
        </View>
        <Text style={styles.title}>Tag Detected</Text>

        <View style={styles.debugContainer}>
          <Text style={styles.debugLabel}>Tag UID</Text>
          <Text style={styles.debugValue}>{lastScan.tagUid}</Text>
        </View>

        <TailTagButton onPress={handleReset} style={styles.button}>
          Scan Another Tag
        </TailTagButton>
      </TailTagCard>
    );
  }

  // Tag not found state
  if (step === 'tag_not_found') {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="help-circle-outline" size={48} color={colors.amber} />
        </View>
        <Text style={styles.title}>Tag Not Found</Text>

        {lastScan && (
          <View style={styles.debugContainer}>
            <Text style={styles.debugLabel}>Tag UID</Text>
            <Text style={styles.debugValue}>{lastScan.tagUid}</Text>
          </View>
        )}

        <Text style={styles.body}>
          {errorMessage ?? 'This tag is not registered to any fursuit.'}
        </Text>

        <TailTagButton onPress={handleReset} style={styles.button}>
          Scan Another Tag
        </TailTagButton>
      </TailTagCard>
    );
  }

  // Scanning state (waiting for NFC tap)
  if (isScanning || step === 'scanning') {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="radio-outline" size={48} color={colors.primary} />
        </View>
        <Text style={styles.title}>Ready to Scan</Text>
        <Text style={styles.body}>Hold your device near a TailTag to scan it.</Text>
        <TailTagButton
          variant="outline"
          onPress={cancelScan}
          style={styles.button}
        >
          Cancel
        </TailTagButton>
      </TailTagCard>
    );
  }

  // Error state
  if ((step === 'error' || scanState === 'error') && (errorMessage || error)) {
    return (
      <TailTagCard style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="close-circle" size={48} color={colors.destructive} />
        </View>
        <Text style={styles.title}>Scan Failed</Text>
        <Text style={styles.body}>{errorMessage ?? error?.message}</Text>
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
