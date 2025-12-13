import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKeepAwake } from 'expo-keep-awake';
import * as Brightness from 'expo-brightness';
import * as FileSystem from 'expo-file-system';
import { Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';

import { TailTagCard } from '../src/components/ui/TailTagCard';
import { TailTagButton } from '../src/components/ui/TailTagButton';
import { colors, spacing, radius } from '../src/theme';
import { useAuth } from '../src/features/auth';
import {
  QR_READY_SUITS_QUERY_KEY,
  createSignedQrDownloadUrl,
  fetchQrReadySuits,
  qrReadySuitsQueryKey,
} from '../src/features/nfc';
import type { QrReadyFursuit } from '../src/features/nfc';

const STORAGE_KEY = 'tailtag:last-qr-fursuit';
const WINDOW_WIDTH = Dimensions.get('window').width;

type Params = {
  initialFursuitId?: string;
};

type RenderItemProps = {
  item: QrReadyFursuit;
  width: number;
  downloadingTagId: string | null;
  onDownload: (entry: QrReadyFursuit) => void;
};

function QrPagerItem({ item, width, downloadingTagId, onDownload }: RenderItemProps) {
  const payload = useMemo(() => `tailtag://catch?v=1&t=${item.qrToken}`, [item.qrToken]);

  return (
    <View style={[styles.page, { width }]}>
      <TailTagCard>
        <View style={styles.pageContent}>
          <Text style={styles.pageTitle}>{item.fursuitName}</Text>
          <Text style={styles.pageSubtitle}>Scan to catch me!</Text>
          <View style={styles.largeQrCanvas}>
            <QRCode value={payload} size={Math.min(width - spacing.xl * 2, 320)} color="#0f172a" backgroundColor="#ffffff" ecl="H" />
          </View>
          {item.fursuitAvatarUrl ? (
            <Image source={{ uri: item.fursuitAvatarUrl }} style={styles.avatar} />
          ) : null}
          <TailTagButton
            variant="outline"
            onPress={() => onDownload(item)}
            loading={downloadingTagId === item.tagId}
            disabled={downloadingTagId === item.tagId}
          >
            Download QR
          </TailTagButton>
          {item.qrTokenCreatedAt ? (
            <Text style={styles.pageMeta}>
              Rotated {new Date(item.qrTokenCreatedAt).toLocaleDateString()}
            </Text>
          ) : (
            <Text style={styles.pageMeta}>Never rotated</Text>
          )}
        </View>
      </TailTagCard>
    </View>
  );
}

export default function ShowQrScreen() {
  useKeepAwake();
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const requestedInitialId = typeof params.initialFursuitId === 'string' ? params.initialFursuitId : null;

  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const flatListRef = useRef<FlatList<QrReadyFursuit>>(null);
  const [storedInitialId, setStoredInitialId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isBrightnessBoosted, setBrightnessBoosted] = useState(false);
  const [originalBrightness, setOriginalBrightness] = useState<number | null>(null);
  const [downloadingTagId, setDownloadingTagId] = useState<string | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(WINDOW_WIDTH);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (mounted && typeof value === 'string') {
          setStoredInitialId(value);
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  const {
    data: suits = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<QrReadyFursuit[], Error>({
    queryKey: userId ? qrReadySuitsQueryKey(userId) : [QR_READY_SUITS_QUERY_KEY, 'guest'],
    enabled: Boolean(userId),
    queryFn: () => fetchQrReadySuits(userId!),
  });

  useEffect(() => {
    if (!suits.length) {
      setCurrentIndex(0);
      return;
    }

    const targetId = requestedInitialId ?? storedInitialId ?? suits[0]?.fursuitId;
    const nextIndex = targetId ? suits.findIndex((entry) => entry.fursuitId === targetId) : 0;
    const safeIndex = nextIndex >= 0 ? nextIndex : 0;
    setCurrentIndex(safeIndex);
    flatListRef.current?.scrollToIndex({ index: safeIndex, animated: false });
  }, [suits, requestedInitialId, storedInitialId]);

  useEffect(() => {
    const entry = suits[currentIndex];
    if (entry) {
      AsyncStorage.setItem(STORAGE_KEY, entry.fursuitId).catch(() => undefined);
    }
  }, [suits, currentIndex]);

  const handleToggleBrightness = useCallback(async () => {
    try {
      if (!isBrightnessBoosted) {
        if (Brightness.requestPermissionsAsync) {
          const permission = await Brightness.requestPermissionsAsync();
          if (permission.status !== 'granted') {
            Alert.alert('Permission needed', 'Allow TailTag to adjust brightness to boost your QR visibility.');
            return;
          }
        }
        const current = await Brightness.getBrightnessAsync();
        setOriginalBrightness(current);
        await Brightness.setBrightnessAsync(1);
        setBrightnessBoosted(true);
      } else {
        if (originalBrightness !== null) {
          await Brightness.setBrightnessAsync(originalBrightness);
        }
        setBrightnessBoosted(false);
      }
    } catch (error) {
      Alert.alert('Brightness', error instanceof Error ? error.message : 'Could not adjust screen brightness.');
    }
  }, [isBrightnessBoosted, originalBrightness]);

  useEffect(() => {
    return () => {
      if (isBrightnessBoosted && originalBrightness !== null) {
        void Brightness.setBrightnessAsync(originalBrightness);
      }
    };
  }, [isBrightnessBoosted, originalBrightness]);

  const handleDownload = useCallback(async (entry: QrReadyFursuit) => {
    if (!entry.qrAssetPath) {
      Alert.alert('QR unavailable', 'Generate a QR code for this fursuit first.');
      return;
    }

    setDownloadingTagId(entry.tagId);
    try {
      const signedUrl = await createSignedQrDownloadUrl(entry.qrAssetPath);
      const safeName = entry.fursuitName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'fursuit';
      const cacheRoot = (Paths?.cache?.uri as string | undefined) ?? (Paths?.document?.uri as string | undefined) ?? '';
      const targetPath = `${cacheRoot}tailtag-qr-${safeName}.png`;
      const { uri } = await FileSystem.downloadAsync(signedUrl, targetPath);
      const canShare = await Sharing.isAvailableAsync();

      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `QR code for ${entry.fursuitName}`,
        });
      } else {
        Alert.alert('QR downloaded', 'Saved to your device cache.');
      }
    } catch (error) {
      Alert.alert('Download failed', error instanceof Error ? error.message : 'We could not download that QR code.');
    } finally {
      setDownloadingTagId(null);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleManageTags = useCallback(() => {
    router.push('/(tabs)/suits');
  }, [router]);

  const pageWidth = useMemo(
    () => (carouselWidth > 0 ? carouselWidth : WINDOW_WIDTH),
    [carouselWidth],
  );
  const showEmptyState = !isLoading && suits.length === 0;

  const handleCarouselLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== carouselWidth) {
      setCarouselWidth(width);
    }
  }, [carouselWidth]);

  return (
    <>
      <Stack.Screen options={{ title: 'Show My QR' }} />
      <View style={styles.screen}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading your QR codes…</Text>
          </View>
        ) : userId === null ? (
          <TailTagCard>
            <Text style={styles.emptyTitle}>Sign in required</Text>
            <Text style={styles.emptyBody}>Sign in to view your QR backups.</Text>
            <TailTagButton onPress={() => router.push('/auth')}>Go to sign in</TailTagButton>
          </TailTagCard>
        ) : showEmptyState ? (
          <TailTagCard>
            <Text style={styles.emptyTitle}>No QR codes yet</Text>
            <Text style={styles.emptyBody}>
              Link an NFC tag and generate a QR backup from the tag management screen to view it here.
            </Text>
            <TailTagButton onPress={handleManageTags}>Manage Tags</TailTagButton>
          </TailTagCard>
        ) : (
          <View style={styles.carouselWrapper} onLayout={handleCarouselLayout}>
            <FlatList
              ref={flatListRef}
              data={suits}
              horizontal
              pagingEnabled={suits.length > 1}
              scrollEnabled={suits.length > 1}
              snapToAlignment="center"
              keyExtractor={(item) => item.tagId}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const width = pageWidth || 1;
                const index = Math.round(event.nativeEvent.contentOffset.x / width);
                setCurrentIndex(index);
              }}
              renderItem={({ item }) => (
                <QrPagerItem
                  item={item}
                  width={pageWidth}
                  downloadingTagId={downloadingTagId}
                  onDownload={handleDownload}
                />
              )}
              refreshing={isRefetching}
              onRefresh={handleRefresh}
            />
            {suits.length > 1 ? (
              <View style={styles.pageDots}>
                {suits.map((entry, index) => (
                  <View
                    key={entry.tagId}
                    style={[styles.pageDot, index === currentIndex && styles.pageDotActive]}
                  />
                ))}
              </View>
            ) : null}
          </View>
        )}

        <View style={styles.footerActions}>
          <TailTagButton
            variant="outline"
            onPress={handleToggleBrightness}
          >
            {isBrightnessBoosted ? 'Restore Brightness' : 'Boost Brightness'}
          </TailTagButton>
          <TailTagButton variant="ghost" onPress={handleManageTags}>
            Manage Tags
          </TailTagButton>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  carouselWrapper: {
    flex: 1,
  },
  page: {
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  pageContent: {
    gap: spacing.md,
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
  },
  pageSubtitle: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 16,
  },
  pageMeta: {
    color: 'rgba(148,163,184,0.8)',
    fontSize: 12,
    textAlign: 'center',
  },
  largeQrCanvas: {
    backgroundColor: '#ffffff',
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'rgba(148,163,184,0.3)',
  },
  pageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  pageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(148,163,184,0.4)',
  },
  pageDotActive: {
    backgroundColor: colors.primary,
  },
  footerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
    marginBottom: spacing.md,
  },
});
