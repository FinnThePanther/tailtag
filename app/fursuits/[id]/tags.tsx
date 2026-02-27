import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import * as FileSystem from 'expo-file-system';
import { Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { TailTagCard } from '../../../src/components/ui/TailTagCard';
import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import {
  fetchFursuitDetail,
  fursuitDetailQueryKey,
} from '../../../src/features/suits';
import { useAuth } from '../../../src/features/auth';
import {
  TagRegistrationFlow,
  TagStatusBadge,
  fetchFursuitTag,
  fetchFursuitQrTag,
  nfcTagQueryKey,
  fursuitQrQueryKey,
  qrReadySuitsQueryKey,
  unlinkTag,
  markTagLost,
  markTagFound,
  generateQrForTag,
  rotateQrForTag,
  ensureQrBackupForFursuit,
  createSignedQrDownloadUrl,
} from '../../../src/features/nfc';
import { colors, spacing, radius } from '../../../src/theme';

export default function ManageTagsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const fursuitId = typeof params.id === 'string' ? params.id : null;

  const [showRegistration, setShowRegistration] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [qrAction, setQrAction] = useState<'generate' | 'rotate' | 'download' | null>(null);

  const {
    data: detail,
    isLoading: isDetailLoading,
    error: detailError,
  } = useQuery({
    enabled: Boolean(fursuitId),
    queryKey: fursuitDetailQueryKey(fursuitId ?? ''),
    queryFn: () => fetchFursuitDetail(fursuitId ?? ''),
    staleTime: 2 * 60_000,
  });

  const {
    data: nfcTag,
    isLoading: isNfcTagLoading,
    refetch: refetchNfcTag,
  } = useQuery({
    enabled: Boolean(fursuitId),
    queryKey: nfcTagQueryKey(fursuitId ?? ''),
    queryFn: () => fetchFursuitTag(fursuitId ?? ''),
    staleTime: 2 * 60_000,
  });

  const {
    data: qrTag,
    isLoading: isQrTagLoading,
    refetch: refetchQrTag,
  } = useQuery({
    enabled: Boolean(fursuitId),
    queryKey: fursuitQrQueryKey(fursuitId ?? ''),
    queryFn: () => fetchFursuitQrTag(fursuitId ?? ''),
    staleTime: 2 * 60_000,
  });

  const isOwner = detail && userId ? detail.owner_id === userId : false;
  const isLoading = isDetailLoading || isNfcTagLoading || isQrTagLoading;
  const fursuitName = detail?.name ?? 'Fursuit';
  const hasQrToken = Boolean(qrTag?.qrToken);
  const qrPayload = useMemo(
    () => (qrTag?.qrToken ? `tailtag://catch?v=1&t=${qrTag.qrToken}` : null),
    [qrTag?.qrToken]
  );
  const qrCreatedDate = useMemo(
    () => (qrTag?.qrTokenCreatedAt ? new Date(qrTag.qrTokenCreatedAt).toLocaleDateString() : null),
    [qrTag?.qrTokenCreatedAt]
  );
  const displayTagUid = useMemo(() => {
    if (!nfcTag) return null;
    if (!nfcTag.uid || nfcTag.uid === 'QR-ONLY') {
      return 'QR backup only';
    }
    return nfcTag.uid;
  }, [nfcTag]);
  const canShowMyQr = Boolean(hasQrToken && fursuitId);

  const handleRegistrationComplete = useCallback(() => {
    setShowRegistration(false);
    refetchNfcTag();
  }, [refetchNfcTag]);

  const handleUnlink = useCallback(async () => {
    if (!nfcTag) return;

    Alert.alert(
      'Unlink Tag',
      `Are you sure you want to unlink this NFC tag from ${fursuitName}? You can register a new tag afterwards.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            setIsUpdating(true);
            const result = await unlinkTag(nfcTag.uid);
            setIsUpdating(false);

            if ('code' in result) {
              Alert.alert('Error', result.message);
            } else {
              queryClient.invalidateQueries({ queryKey: nfcTagQueryKey(fursuitId ?? '') });
              refetchNfcTag();
            }
          },
        },
      ]
    );
  }, [nfcTag, fursuitName, fursuitId, queryClient, refetchNfcTag]);

  const handleMarkLost = useCallback(async () => {
    if (!nfcTag) return;

    Alert.alert(
      'Mark Tag as Lost',
      'If you mark this tag as lost, it cannot be used for catches until you find it again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as Lost',
          style: 'destructive',
          onPress: async () => {
            setIsUpdating(true);
            const result = await markTagLost(nfcTag.uid);
            setIsUpdating(false);

            if ('code' in result) {
              Alert.alert('Error', result.message);
            } else {
              refetchNfcTag();
            }
          },
        },
      ]
    );
  }, [nfcTag, refetchNfcTag]);

  const handleMarkFound = useCallback(async () => {
    if (!nfcTag) return;

    setIsUpdating(true);
    const result = await markTagFound(nfcTag.uid);
    setIsUpdating(false);

    if ('code' in result) {
      Alert.alert('Error', result.message);
    } else {
      refetchNfcTag();
    }
  }, [nfcTag, refetchNfcTag]);

  const handleShowMyQr = useCallback(() => {
    if (!canShowMyQr) {
      Alert.alert('QR code unavailable', 'Generate a QR backup first.');
      return;
    }

    router.push({
      pathname: '/show-qr',
      params: { initialFursuitId: fursuitId ?? '' },
    });
  }, [canShowMyQr, router, fursuitId]);

  const handleGenerateQr = useCallback(async () => {
    if (!fursuitId) return;

    setQrAction('generate');
    try {
      if (!qrTag) {
        await ensureQrBackupForFursuit(fursuitId);
      } else if (qrTag.id) {
        const result = await generateQrForTag(qrTag.id);
        if (!('success' in result)) {
          Alert.alert('Could not generate QR', result.message);
          return;
        }
      }

      await refetchQrTag();
      if (userId) {
        queryClient.invalidateQueries({ queryKey: qrReadySuitsQueryKey(userId) });
      }
      Alert.alert('QR code ready', 'You can now show or download your QR backup.');
    } catch (error) {
      Alert.alert(
        'Could not generate QR',
        error instanceof Error ? error.message : 'Something went wrong while preparing your QR code.'
      );
    } finally {
      setQrAction(null);
    }
  }, [qrTag, fursuitId, refetchQrTag, queryClient, userId]);

  const handleRotateQr = useCallback(() => {
    if (!qrTag?.id) return;

    Alert.alert(
      'Rotate QR code?',
      'Rotating your QR code immediately invalidates the old one. Share the new code once rotation completes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rotate',
          style: 'destructive',
          onPress: async () => {
            setQrAction('rotate');
            const result = await rotateQrForTag(qrTag.id);
            setQrAction(null);

            if ('success' in result) {
              refetchQrTag();
              if (userId) {
                queryClient.invalidateQueries({ queryKey: qrReadySuitsQueryKey(userId) });
              }
              Alert.alert('QR code rotated', 'Your new QR code is ready to scan.');
            } else {
              Alert.alert('Could not rotate QR', result.message);
            }
          },
        },
      ]
    );
  }, [qrTag, refetchQrTag, queryClient, userId]);

  const handleDownloadQr = useCallback(async () => {
    if (!qrTag?.qrAssetPath) {
      Alert.alert('QR code unavailable', 'Generate a QR code first.');
      return;
    }

    setQrAction('download');
    try {
      const signedUrl = await createSignedQrDownloadUrl(qrTag.qrAssetPath);
      const safeName = fursuitName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const cacheRoot = (Paths?.cache?.uri as string | undefined) ?? (Paths?.document?.uri as string | undefined) ?? '';
      const targetPath = `${cacheRoot}tailtag-qr-${safeName || 'fursuit'}.png`;
      const { uri } = await FileSystem.downloadAsync(signedUrl, targetPath);
      const canShare = await Sharing.isAvailableAsync();

      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `QR code for ${fursuitName}`,
        });
      } else {
        Alert.alert('QR downloaded', 'Your QR code has been saved to your device cache.');
      }
    } catch (error) {
      Alert.alert(
        'Download failed',
        error instanceof Error ? error.message : 'We could not download that QR code.'
      );
    } finally {
      setQrAction(null);
    }
  }, [qrTag, fursuitName]);

  // Show registration flow
  if (showRegistration && fursuitId) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Register Tag" onBack={() => router.back()} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
          <TagRegistrationFlow
            fursuitId={fursuitId}
            fursuitName={fursuitName}
            onComplete={handleRegistrationComplete}
            onCancel={() => setShowRegistration(false)}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="NFC Tag" onBack={() => router.back()} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <TailTagCard>
          {isLoading ? (
            <Text style={styles.message}>Loading...</Text>
          ) : detailError ? (
            <Text style={styles.errorText}>
              {detailError instanceof Error
                ? detailError.message
                : 'Could not load fursuit details.'}
            </Text>
          ) : !isOwner ? (
            <Text style={styles.message}>
              You can only manage tags for fursuits you own.
            </Text>
          ) : nfcTag ? (
            <View style={styles.tagSection}>
              <View style={styles.tagHeader}>
                <Text style={styles.sectionTitle}>Current Tag</Text>
                <TagStatusBadge status={nfcTag.status} />
              </View>

              <View style={styles.tagInfo}>
                <Text style={styles.tagLabel}>Tag UID</Text>
                <Text style={styles.tagUid}>{displayTagUid ?? '—'}</Text>
              </View>

              {nfcTag.linkedAt && (
                <View style={styles.tagInfo}>
                  <Text style={styles.tagLabel}>Linked</Text>
                  <Text style={styles.tagDate}>
                    {new Date(nfcTag.linkedAt).toLocaleDateString()}
                  </Text>
                </View>
              )}

              <View style={styles.tagActions}>
                {nfcTag.status === 'active' && (
                  <>
                    <TailTagButton
                      variant="outline"
                      onPress={handleMarkLost}
                      loading={isUpdating}
                      disabled={isUpdating}
                    >
                      Mark as Lost
                    </TailTagButton>
                    <TailTagButton
                      variant="ghost"
                      onPress={handleUnlink}
                      loading={isUpdating}
                      disabled={isUpdating}
                    >
                      Unlink Tag
                    </TailTagButton>
                  </>
                )}
                {nfcTag.status === 'lost' && (
                  <TailTagButton
                    onPress={handleMarkFound}
                    loading={isUpdating}
                    disabled={isUpdating}
                  >
                    I Found It!
                  </TailTagButton>
                )}
              </View>

              {nfcTag.status === 'lost' && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    This tag is marked as lost. Catch attempts will fail until you
                    mark it as found.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <Text style={styles.emptyTitle}>No Tag Registered</Text>
              <Text style={styles.emptyBody}>
                Register an NFC tag to let others catch {fursuitName} with a simple
                tap.
              </Text>
              <TailTagButton
                onPress={() => setShowRegistration(true)}
                style={styles.registerButton}
              >
                Register NFC Tag
              </TailTagButton>
            </View>
          )}
        </TailTagCard>

        {isOwner && (
          <TailTagCard>
            <View style={styles.qrSection}>
              <View style={styles.tagHeader}>
                <Text style={styles.sectionTitle}>QR Backup</Text>
                {hasQrToken ? (
                  <Text style={styles.qrMeta}>Works offline, no NFC required</Text>
                ) : null}
              </View>

              {isQrTagLoading ? (
                <Text style={styles.message}>Loading QR code…</Text>
              ) : hasQrToken && qrPayload ? (
                <>
                  <View style={styles.qrPreview}>
                    <View style={styles.qrCanvas}>
                      <QRCode
                        value={qrPayload}
                        size={180}
                        color="#0f172a"
                        backgroundColor="#ffffff"
                        ecl="H"
                      />
                    </View>
                  </View>
                  {qrCreatedDate ? (
                    <Text style={styles.qrMeta}>Last rotated {qrCreatedDate}</Text>
                  ) : null}
                  <Text style={styles.qrDescription}>
                    Show this code on your phone or download the PNG before printing badges. Rotate if
                    you ever need to invalidate a leaked QR.
                  </Text>
                  <View style={styles.qrButtons}>
                    <TailTagButton onPress={handleShowMyQr} disabled={!canShowMyQr}>
                      Show My QR
                    </TailTagButton>
                    <TailTagButton
                      variant="outline"
                      onPress={handleDownloadQr}
                      loading={qrAction === 'download'}
                      disabled={qrAction === 'download'}
                    >
                      Download
                    </TailTagButton>
                  </View>
                  <TailTagButton
                    variant="ghost"
                    onPress={handleRotateQr}
                    loading={qrAction === 'rotate'}
                    disabled={qrAction === 'rotate'}
                  >
                    Rotate QR Code
                  </TailTagButton>
                </>
              ) : qrTag ? (
                <>
                  <Text style={styles.qrDescription}>
                    This QR tag is linked to {fursuitName} but does not have an active token. Generate
                    a new QR code to enable on-screen catching.
                  </Text>
                  <TailTagButton
                    onPress={handleGenerateQr}
                    loading={qrAction === 'generate'}
                    disabled={qrAction === 'generate'}
                  >
                    Generate QR Code
                  </TailTagButton>
                </>
              ) : (
                <>
                  <Text style={styles.qrDescription}>
                    Generate a QR backup so other players can catch you even if your NFC tag fails.
                    The QR lives in the app and works without a network connection.
                  </Text>
                  <TailTagButton
                    onPress={handleGenerateQr}
                    loading={qrAction === 'generate'}
                    disabled={qrAction === 'generate'}
                  >
                    Create QR Backup
                  </TailTagButton>
                </>
              )}
            </View>
          </TailTagCard>
        )}

        {nfcTag && isOwner && (
          <TailTagCard>
            <View style={styles.registerNewSection}>
              <Text style={styles.sectionTitle}>Replace Tag</Text>
              <Text style={styles.message}>
                Lost your tag or want to use a different one? Unlink the current
                tag first, then register a new one.
              </Text>
            </View>
          </TailTagCard>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  message: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  tagSection: {
    gap: spacing.md,
  },
  tagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  tagInfo: {
    gap: spacing.xs / 2,
  },
  tagLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: 'rgba(148,163,184,0.8)',
  },
  tagUid: {
    fontFamily: 'monospace',
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    letterSpacing: 1,
  },
  tagDate: {
    fontSize: 14,
    color: colors.foreground,
  },
  tagActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  warningBox: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  warningText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  emptyBody: {
    fontSize: 14,
    color: 'rgba(203,213,225,0.9)',
    textAlign: 'center',
  },
  registerButton: {
    marginTop: spacing.sm,
  },
  registerNewSection: {
    gap: spacing.sm,
  },
  qrSection: {
    gap: spacing.md,
  },
  qrMeta: {
    color: 'rgba(148,163,184,0.8)',
    fontSize: 12,
  },
  qrPreview: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCanvas: {
    backgroundColor: '#ffffff',
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  qrDescription: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  qrButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
