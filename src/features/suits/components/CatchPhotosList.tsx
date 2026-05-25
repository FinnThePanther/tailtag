import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { AppImage } from '../../../components/ui/AppImage';
import { TailTagButton } from '../../../components/ui/TailTagButton';
import { useAuth } from '../../auth/providers/AuthProvider';
import { inferImageExtension, inferImageMimeType } from '../../../utils/images';
import { getStorageAuthHeaders, toExpoImageSource } from '../../../utils/supabase-image';
import { captureHandledException, captureSupabaseError } from '@/lib/sentry';
import type { CatchOfFursuitItem } from '../api/catchesByFursuit';
import { styles } from './CatchPhotosList.styles';

const SCREEN_WIDTH = Dimensions.get('window').width;

type CatchPhotosListProps = {
  items: CatchOfFursuitItem[];
  onAllLoaded?: () => void;
};

const isSupabaseError = (
  error: unknown,
): error is { code?: string; details?: string; hint?: string; message: string } =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as Record<string, unknown>).message === 'string' &&
  ('code' in error || 'details' in error || 'hint' in error);

const clampGalleryIndex = (index: number, length: number): number | null => {
  if (length === 0) return null;
  if (!Number.isFinite(index)) return null;
  return Math.max(0, Math.min(index, length - 1));
};

export function CatchPhotosList({ items, onAllLoaded }: CatchPhotosListProps) {
  const { session } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [settledCount, setSettledCount] = useState(0);

  const withPhoto = items.filter((item): item is CatchOfFursuitItem & { catch_photo_url: string } =>
    Boolean(item.catch_photo_url?.trim()),
  );

  const handleSettled = useCallback(() => {
    setSettledCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (withPhoto.length > 0 && settledCount >= withPhoto.length) {
      onAllLoaded?.();
    }
  }, [settledCount, withPhoto.length, onAllLoaded]);

  useEffect(() => {
    if (galleryIndex !== null) {
      setGalleryIndex(clampGalleryIndex(galleryIndex, withPhoto.length));
    }
  }, [galleryIndex, withPhoto.length]);

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
        await Sharing.shareAsync(file.uri, {
          mimeType,
          dialogTitle: 'Save catch photo',
        });
      } catch (error) {
        if (isSupabaseError(error)) {
          captureSupabaseError(error);
        } else {
          captureHandledException(error, {
            scope: 'CatchPhotosList.download',
          });
        }
        Alert.alert('Download failed', 'Could not download the photo. Please try again.');
      } finally {
        setIsDownloading(false);
      }
    },
    [session?.access_token],
  );

  if (withPhoto.length === 0) {
    return null;
  }

  const clampedIndex =
    galleryIndex !== null ? clampGalleryIndex(galleryIndex, withPhoto.length) : null;

  return (
    <>
      <View style={styles.grid}>
        {withPhoto.map((item, index) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [styles.thumbnailWrap, pressed && styles.thumbnailPressed]}
            onPress={() => setGalleryIndex(index)}
            accessibilityRole="button"
            accessibilityLabel="View catch photo fullscreen"
          >
            <AppImage
              url={item.catch_photo_url}
              width={SCREEN_WIDTH * 0.31}
              height={SCREEN_WIDTH * 0.31}
              style={styles.thumbnail}
              accessibilityLabel="Catch photo thumbnail"
              onLoad={handleSettled}
              onError={handleSettled}
            />
          </Pressable>
        ))}
      </View>

      {clampedIndex !== null ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setGalleryIndex(null)}
          statusBarTranslucent
        >
          <StatusBar hidden />
          <View style={styles.fullscreenBackdrop}>
            <Pressable
              style={styles.fullscreenClose}
              onPress={() => setGalleryIndex(null)}
              accessibilityRole="button"
              accessibilityLabel="Close gallery"
            >
              <Ionicons
                name="close"
                size={28}
                color="#fff"
              />
            </Pressable>
            <FlatList
              data={withPhoto}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={clampedIndex}
              getItemLayout={(_, index) => ({
                length: windowWidth,
                offset: windowWidth * index,
                index,
              })}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
                setGalleryIndex(clampGalleryIndex(idx, withPhoto.length));
              }}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={[styles.gallerySlide, { width: windowWidth }]}>
                  <Image
                    source={toExpoImageSource(item.catch_photo_url, session?.access_token)}
                    style={styles.fullscreenImage}
                    contentFit="contain"
                    accessibilityLabel="Catch photo fullscreen"
                  />
                </View>
              )}
            />
            {withPhoto.length > 1 ? (
              <View style={styles.galleryCounter}>
                <Text style={styles.galleryCounterText}>
                  {clampedIndex + 1} / {withPhoto.length}
                </Text>
              </View>
            ) : null}
            <View style={styles.fullscreenActions}>
              <TailTagButton
                variant="outline"
                size="sm"
                loading={isDownloading}
                onPress={() => void handleDownloadPhoto(withPhoto[clampedIndex].catch_photo_url)}
              >
                Save photo
              </TailTagButton>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}
