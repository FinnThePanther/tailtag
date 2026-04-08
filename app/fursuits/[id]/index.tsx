import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { AppImage } from '../../../src/components/ui/AppImage';
import { TailTagCard } from '../../../src/components/ui/TailTagCard';
import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import {
  CatchPhotosList,
  FursuitBioDetails,
  catchesByFursuitQueryKey,
  fetchCatchesByFursuit,
  fetchFursuitDetail,
  fursuitDetailQueryKey,
} from '../../../src/features/suits';
import { useAuth } from '../../../src/features/auth';
import {
  PROFILE_CONVENTIONS_QUERY_KEY,
  CONVENTIONS_STALE_TIME,
  fetchProfileConventionIds,
} from '../../../src/features/conventions';
import { emitGameplayEvent } from '../../../src/features/events';
import { colors } from '../../../src/theme';
import { styles } from '../../../src/app-styles/fursuits/[id]/index.styles';

const formatDate = (isoTimestamp: string | null) => {
  if (!isoTimestamp) {
    return null;
  }

  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

const formatCatchSummary = (count: number) => {
  if (!Number.isFinite(count) || count <= 0) {
    return 'No catches yet';
  }

  if (count === 1) {
    return 'Caught once';
  }

  return `Caught ${count} times`;
};

export default function FursuitDetailScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const fursuitId = typeof params.id === 'string' ? params.id : null;

  const {
    data: detail,
    isLoading,
    error,
    refetch,
  } = useQuery({
    enabled: Boolean(fursuitId),
    queryKey: fursuitDetailQueryKey(fursuitId ?? ''),
    queryFn: () => fetchFursuitDetail(fursuitId ?? ''),
    staleTime: 2 * 60_000,
  });

  const isOwner = useMemo(() => {
    if (!detail || !userId) {
      return false;
    }

    return detail.owner_id === userId;
  }, [detail, userId]);

  const shouldFetchCatchesOfFursuit = Boolean(
    isOwner && fursuitId && detail && typeof detail.catchCount === 'number' && detail.catchCount > 0,
  );
  const { data: catchesOfFursuit = [] } = useQuery({
    queryKey: catchesByFursuitQueryKey(fursuitId ?? ''),
    queryFn: () => fetchCatchesByFursuit(fursuitId!),
    enabled: shouldFetchCatchesOfFursuit,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data: profileConventionIds = [] } = useQuery<string[], Error>({
    queryKey: [PROFILE_CONVENTIONS_QUERY_KEY, userId],
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchProfileConventionIds(userId!),
  });

  const primaryConventionId = useMemo(
    () => (profileConventionIds.length > 0 ? profileConventionIds[0] : null),
    [profileConventionIds],
  );

  const viewedFursuitRef = useRef<string | null>(null);
  const viewedFursuitId = detail?.id ?? null;
  const viewedFursuitOwnerId = detail?.owner_id ?? null;

  useEffect(() => {
    if (!viewedFursuitId || !userId || !primaryConventionId) {
      return;
    }
    if (viewedFursuitOwnerId === userId) {
      return;
    }
    const key = `${viewedFursuitId}:${primaryConventionId}`;
    if (viewedFursuitRef.current === key) {
      return;
    }
    viewedFursuitRef.current = key;
    void emitGameplayEvent({
      type: 'fursuit_bio_viewed',
      conventionId: primaryConventionId,
      payload: {
        fursuit_id: viewedFursuitId,
        convention_id: primaryConventionId,
        convention_ids: profileConventionIds,
        owner_id: viewedFursuitOwnerId,
      },
    });
  }, [viewedFursuitId, viewedFursuitOwnerId, userId, primaryConventionId, profileConventionIds]);

  const handleCodeCopied = useCallback(() => {
    if (!userId || !viewedFursuitId || !primaryConventionId) {
      return;
    }
    void emitGameplayEvent({
      type: 'catch_shared',
      conventionId: primaryConventionId,
      payload: {
        convention_id: primaryConventionId,
        convention_ids: profileConventionIds,
        fursuit_id: viewedFursuitId,
        context: 'fursuit_detail',
      },
    });
  }, [userId, viewedFursuitId, primaryConventionId, profileConventionIds]);

  const handleEditBio = useCallback(() => {
    if (!fursuitId) {
      return;
    }

    router.push({ pathname: '/fursuits/[id]/edit', params: { id: fursuitId } });
  }, [fursuitId, router]);

  const addedDate = detail ? formatDate(detail.created_at) : null;
  const catchSummary = detail ? formatCatchSummary(detail.catchCount) : null;

  const editButton = isOwner ? (
    <Pressable
      onPress={handleEditBio}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
    >
      <Text style={styles.headerButton}>Edit</Text>
    </Pressable>
  ) : undefined;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={detail?.name ?? 'Fursuit'}
        onBack={() => router.back()}
        right={editButton}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <TailTagCard>
        {isLoading ? (
          <Text style={styles.message}>Loading that fursuit…</Text>
        ) : error ? (
          <View style={styles.errorBlock}>
            <Text style={styles.errorText}>{
              error instanceof Error ? error.message : 'We could not load that fursuit.'
            }</Text>
            <TailTagButton variant="outline" size="sm" onPress={() => refetch()}>
              Try again
            </TailTagButton>
          </View>
        ) : !detail ? (
          <Text style={styles.message}>That fursuit could not be found.</Text>
        ) : (
          <View style={styles.detailStack}>
            <View style={styles.avatarWrapper}>
              {detail.avatar_url ? (
                <AppImage
                  url={detail.avatar_url}
                  width={screenWidth}
                  height={screenWidth}
                  style={styles.avatar}
                />
              ) : (
                <Text style={styles.avatarFallback}>No avatar</Text>
              )}
            </View>
            <View style={styles.leadDetails}>
              <Text style={styles.leadName} numberOfLines={1}>
                {detail.name}
              </Text>
              <Text style={styles.leadMeta} numberOfLines={1}>
                {detail.species?.trim() || 'Species not set yet'}
              </Text>
              <Text style={styles.leadMeta} numberOfLines={1}>
                {detail.colors?.length
                  ? `Colors: ${detail.colors.map((c) => c.name).join(', ')}`
                  : 'None specified'}
              </Text>
              {addedDate ? (
                <Text style={styles.leadTimeline}>Added on {addedDate}</Text>
              ) : null}
            </View>
            {detail.unique_code?.trim() ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Catch code</Text>
                <Pressable
                  onLongPress={() => {
                    void Clipboard.setStringAsync(
                      detail.unique_code!.trim().toUpperCase(),
                    );
                    Alert.alert('Code copied', 'The catch code is ready to paste.');
                    handleCodeCopied();
                  }}
                  accessibilityRole="button"
                  accessibilityHint="Long press to copy the code"
                >
                  <Text style={styles.codeValue}>
                    {detail.unique_code.trim().toUpperCase()}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {!isOwner && detail.owner_id ? (
              <Pressable
                style={({ pressed }) => [styles.ownerRow, pressed && styles.ownerRowPressed]}
                onPress={() =>
                  router.push({ pathname: '/profile/[id]', params: { id: detail.owner_id } })
                }
              >
                <Text style={styles.ownerLabel}>Owner</Text>
                <View style={styles.ownerRight}>
                  <Text style={styles.ownerName}>
                    {detail.bio?.ownerName?.trim()}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                </View>
              </Pressable>
            ) : null}
            {detail.bio ? (
              <FursuitBioDetails bio={detail.bio} />
            ) : (
              <Text style={styles.message}>This fursuit does not have a bio yet.</Text>
            )}
            {typeof detail.catchCount === 'number' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {isOwner ? 'Catch stats' : 'Catch history'}
                </Text>
                <Text style={styles.sectionItem}>{catchSummary}</Text>
              </View>
            ) : null}
            {isOwner &&
            catchesOfFursuit.some((c) => c.catch_photo_url?.trim()) ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Catch photos</Text>
                <CatchPhotosList items={catchesOfFursuit} />
              </View>
            ) : null}
            {detail.conventions.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Convention appearances</Text>
                {detail.conventions.map((convention) => (
                  <Text key={convention.id} style={styles.sectionItem}>
                    {convention.name}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </TailTagCard>
      </ScrollView>
    </View>
  );
}
