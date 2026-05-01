import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { AppImage } from '../../src/components/ui/AppImage';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import {
  FursuitCard,
  FursuitBioDetails,
  fursuitBioHasDisplayableContent,
  catchByIdQueryKey,
  caughtSuitsQueryKey,
  fetchCatchById,
} from '../../src/features/suits';
import type { CaughtRecord } from '../../src/features/suits';
import { useAuth } from '../../src/features/auth';
import { ContentActionMenu } from '../../src/features/moderation';
import { toDisplayDateTime } from '../../src/utils/dates';
import { inferImageExtension, inferImageMimeType } from '../../src/utils/images';
import { getStorageAuthHeaders, toExpoImageSource } from '../../src/utils/supabase-image';
import { styles } from '../../src/app-styles/catches/[id].styles';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function CatchDetailScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const catchId = typeof params.id === 'string' ? params.id : null;

  const queryClient = useQueryClient();

  const recordFromCache = useMemo<CaughtRecord | null>(() => {
    if (!userId || !catchId) return null;
    const records = queryClient.getQueryData<CaughtRecord[]>(caughtSuitsQueryKey(userId));
    return records?.find((r) => r.id === catchId) ?? null;
  }, [queryClient, userId, catchId]);

  const shouldFetchById = Boolean(catchId && !recordFromCache);
  const { data: recordFromApi, isLoading: isFetchingCatch } = useQuery({
    queryKey: catchByIdQueryKey(catchId ?? ''),
    queryFn: () => fetchCatchById(catchId!),
    enabled: shouldFetchById,
    staleTime: 2 * 60_000,
  });

  const record = recordFromCache ?? recordFromApi ?? null;
  const details = record?.fursuit ?? null;

  const caughtLabel = toDisplayDateTime(record?.caught_at) ?? 'Caught just now';
  const pieces = [caughtLabel];
  if (typeof record?.catchNumber === 'number' && record.catchNumber > 0) {
    pieces.push(`Catcher #${record.catchNumber}`);
  }
  const timelineLabel = pieces.join(' · ');

  const [isDownloading, setIsDownloading] = useState(false);
  const [photoFullscreen, setPhotoFullscreen] = useState(false);
  const ownerId = details?.owner_id ?? null;
  const canModerateOwnerContent = Boolean(ownerId && userId && ownerId !== userId);

  const handleDownloadPhoto = useCallback(
    async (url: string) => {
      setIsDownloading(true);
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          Alert.alert('Not supported', 'Sharing is not available on this device.');
          return;
        }
        const extension = inferImageExtension({ uri: url }) || 'jpg';
        const mimeType = inferImageMimeType({ uri: url });
        const dest = new File(Paths.cache, `catch-${Date.now()}.${extension}`);
        const file = await File.downloadFileAsync(url, dest, {
          headers: getStorageAuthHeaders(url, session?.access_token),
        });
        await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Save catch photo' });
      } catch {
        Alert.alert('Download failed', 'Could not download the photo. Please try again.');
      } finally {
        setIsDownloading(false);
      }
    },
    [session?.access_token],
  );

  if (!record || !details) {
    const isLoading = shouldFetchById && isFetchingCatch;
    return (
      <View style={styles.screen}>
        <ScreenHeader
          title="Catch"
          onBack={() => router.back()}
        />
        <View style={styles.centeredContent}>
          <TailTagCard>
            <Text style={styles.message}>
              {isLoading
                ? 'Loading catch…'
                : 'This catch could not be found. Go back and try again.'}
            </Text>
            {!isLoading ? (
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={() => router.back()}
              >
                Go back
              </TailTagButton>
            ) : null}
          </TailTagCard>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={`Caught: ${details.name}`}
        onBack={() => router.back()}
        right={
          canModerateOwnerContent ? (
            <ContentActionMenu
              currentUserId={userId}
              reportedUserId={ownerId}
              reportedFursuitId={details.id}
              targetName={details.bio?.ownerName || details.name}
              reportLabel={record.catchPhotoUrl ? 'Report catch photo' : 'Report fursuit'}
              reportTitle={record.catchPhotoUrl ? 'Report catch photo' : `Report ${details.name}`}
              blockLabel="Block owner"
            />
          ) : undefined
        }
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
      >
        <TailTagCard>
          <View style={styles.detailStack}>
            <Pressable
              onPress={() =>
                router.push({ pathname: '/fursuits/[id]', params: { id: details.id } })
              }
              style={({ pressed }) => pressed && styles.pressed}
              accessibilityRole="button"
              accessibilityLabel={`View ${details.name}'s fursuit profile`}
            >
              <FursuitCard
                name={details.name}
                species={details.species}
                colors={details.colors}
                avatarUrl={details.avatar_url}
                uniqueCode={details.unique_code}
                timelineLabel={timelineLabel}
                codeLabel={undefined}
              />
            </Pressable>
            {record.catchPhotoUrl ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Catch photo</Text>
                <Pressable
                  onPress={() => setPhotoFullscreen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="View catch photo fullscreen"
                >
                  <AppImage
                    url={record.catchPhotoUrl}
                    width={SCREEN_WIDTH}
                    height={SCREEN_WIDTH * 0.75}
                    style={styles.catchPhoto}
                    accessibilityLabel="Catch selfie photo"
                  />
                </Pressable>
                <TailTagButton
                  variant="outline"
                  size="sm"
                  loading={isDownloading}
                  onPress={() => void handleDownloadPhoto(record.catchPhotoUrl!)}
                >
                  Save photo
                </TailTagButton>
              </View>
            ) : null}
            {fursuitBioHasDisplayableContent(details.bio, details.makers) ? (
              <FursuitBioDetails
                bio={details.bio}
                makers={details.makers}
              />
            ) : null}
          </View>
        </TailTagCard>
      </ScrollView>

      {record.catchPhotoUrl ? (
        <Modal
          visible={photoFullscreen}
          transparent
          animationType="fade"
          onRequestClose={() => setPhotoFullscreen(false)}
          statusBarTranslucent
        >
          <StatusBar hidden />
          <View style={styles.fullscreenBackdrop}>
            <Pressable
              style={styles.fullscreenClose}
              onPress={() => setPhotoFullscreen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close fullscreen photo"
            >
              <Ionicons
                name="close"
                size={28}
                color="#fff"
              />
            </Pressable>
            <Image
              source={toExpoImageSource(record.catchPhotoUrl, session?.access_token)}
              style={styles.fullscreenImage}
              contentFit="contain"
              accessibilityLabel="Catch selfie photo fullscreen"
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
