import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Alert } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { TailTagCard } from '../../../src/components/ui/TailTagCard';
import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import {
  fetchFursuitDetail,
  fursuitDetailQueryKey,
} from '../../../src/features/suits';
import { useAuth } from '../../../src/features/auth';
import {
  TagRegistrationFlow,
  TagStatusBadge,
  fetchFursuitTag,
  nfcTagQueryKey,
  unlinkTag,
  markTagLost,
  markTagFound,
} from '../../../src/features/nfc';
import { colors, spacing, radius } from '../../../src/theme';

export default function ManageTagsScreen() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const fursuitId = typeof params.id === 'string' ? params.id : null;

  const [showRegistration, setShowRegistration] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

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
    data: tag,
    isLoading: isTagLoading,
    refetch: refetchTag,
  } = useQuery({
    enabled: Boolean(fursuitId),
    queryKey: nfcTagQueryKey(fursuitId ?? ''),
    queryFn: () => fetchFursuitTag(fursuitId ?? ''),
    staleTime: 2 * 60_000,
  });

  const isOwner = detail && userId ? detail.owner_id === userId : false;
  const isLoading = isDetailLoading || isTagLoading;
  const fursuitName = detail?.name ?? 'Fursuit';

  const handleRegistrationComplete = useCallback(() => {
    setShowRegistration(false);
    refetchTag();
  }, [refetchTag]);

  const handleUnlink = useCallback(async () => {
    if (!tag) return;

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
            const result = await unlinkTag(tag.uid);
            setIsUpdating(false);

            if ('code' in result) {
              Alert.alert('Error', result.message);
            } else {
              queryClient.invalidateQueries({ queryKey: nfcTagQueryKey(fursuitId ?? '') });
              refetchTag();
            }
          },
        },
      ]
    );
  }, [tag, fursuitName, fursuitId, queryClient, refetchTag]);

  const handleMarkLost = useCallback(async () => {
    if (!tag) return;

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
            const result = await markTagLost(tag.uid);
            setIsUpdating(false);

            if ('code' in result) {
              Alert.alert('Error', result.message);
            } else {
              refetchTag();
            }
          },
        },
      ]
    );
  }, [tag, refetchTag]);

  const handleMarkFound = useCallback(async () => {
    if (!tag) return;

    setIsUpdating(true);
    const result = await markTagFound(tag.uid);
    setIsUpdating(false);

    if ('code' in result) {
      Alert.alert('Error', result.message);
    } else {
      refetchTag();
    }
  }, [tag, refetchTag]);

  // Show registration flow
  if (showRegistration && fursuitId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Register Tag' }} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
          <TagRegistrationFlow
            fursuitId={fursuitId}
            fursuitName={fursuitName}
            onComplete={handleRegistrationComplete}
            onCancel={() => setShowRegistration(false)}
          />
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'NFC Tag' }} />
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
          ) : tag ? (
            <View style={styles.tagSection}>
              <View style={styles.tagHeader}>
                <Text style={styles.sectionTitle}>Current Tag</Text>
                <TagStatusBadge status={tag.status} />
              </View>

              <View style={styles.tagInfo}>
                <Text style={styles.tagLabel}>Tag UID</Text>
                <Text style={styles.tagUid}>{tag.uid}</Text>
              </View>

              {tag.linkedAt && (
                <View style={styles.tagInfo}>
                  <Text style={styles.tagLabel}>Linked</Text>
                  <Text style={styles.tagDate}>
                    {new Date(tag.linkedAt).toLocaleDateString()}
                  </Text>
                </View>
              )}

              <View style={styles.tagActions}>
                {tag.status === 'active' && (
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
                {tag.status === 'lost' && (
                  <TailTagButton
                    onPress={handleMarkFound}
                    loading={isUpdating}
                    disabled={isUpdating}
                  >
                    I Found It!
                  </TailTagButton>
                )}
              </View>

              {tag.status === 'lost' && (
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

        {tag && isOwner && (
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
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
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
});
