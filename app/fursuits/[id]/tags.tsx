import { useCallback, useState } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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
  nfcTagQueryKey,
  unlinkTag,
  markTagLost,
  markTagFound,
} from '../../../src/features/nfc';
import { styles } from '../../../src/app-styles/fursuits/[id]/tags.styles';

export default function ManageTagsScreen() {
  const router = useRouter();
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
    data: nfcTag,
    isLoading: isNfcTagLoading,
    refetch: refetchNfcTag,
  } = useQuery({
    enabled: Boolean(fursuitId),
    queryKey: nfcTagQueryKey(fursuitId ?? ''),
    queryFn: () => fetchFursuitTag(fursuitId ?? ''),
    staleTime: 2 * 60_000,
  });

  const isOwner = detail && userId ? detail.owner_id === userId : false;
  const isLoading = isDetailLoading || isNfcTagLoading;
  const fursuitName = detail?.name ?? 'Fursuit';
  const displayTagUid = nfcTag?.uid ?? null;

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
