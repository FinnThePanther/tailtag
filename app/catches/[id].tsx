import { useCallback, useMemo, useState } from "react";
import { Alert, Dimensions, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { AppImage } from "../../src/components/ui/AppImage";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import { TailTagButton } from "../../src/components/ui/TailTagButton";
import { TailTagCard } from "../../src/components/ui/TailTagCard";
import {
  FursuitCard,
  FursuitBioDetails,
  catchByIdQueryKey,
  caughtSuitsQueryKey,
  fetchCatchById,
} from "../../src/features/suits";
import type { CaughtRecord } from "../../src/features/suits";
import { useAuth } from "../../src/features/auth";
import { colors, spacing } from "../../src/theme";
import { toDisplayDateTime } from "../../src/utils/dates";
import { inferImageExtension, inferImageMimeType } from "../../src/utils/images";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function CatchDetailScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const catchId = typeof params.id === "string" ? params.id : null;

  const queryClient = useQueryClient();

  const recordFromCache = useMemo<CaughtRecord | null>(() => {
    if (!userId || !catchId) return null;
    const records = queryClient.getQueryData<CaughtRecord[]>(
      caughtSuitsQueryKey(userId),
    );
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

  const caughtLabel = toDisplayDateTime(record?.caught_at) ?? "Caught just now";
  const pieces = [caughtLabel];
  if (typeof record?.catchNumber === "number" && record.catchNumber > 0) {
    pieces.push(`Catcher #${record.catchNumber}`);
  }
  const timelineLabel = pieces.join(" · ");

  const [isDownloading, setIsDownloading] = useState(false);
  const [photoFullscreen, setPhotoFullscreen] = useState(false);

  const handleDownloadPhoto = useCallback(async (url: string) => {
    setIsDownloading(true);
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Not supported", "Sharing is not available on this device.");
        return;
      }
      const extension = inferImageExtension({ uri: url }) || "jpg";
      const mimeType = inferImageMimeType({ uri: url });
      const dest = new File(Paths.cache, `catch-${Date.now()}.${extension}`);
      const file = await File.downloadFileAsync(url, dest);
      await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: "Save catch photo" });
    } catch {
      Alert.alert("Download failed", "Could not download the photo. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }, []);

  if (!record || !details) {
    const isLoading = shouldFetchById && isFetchingCatch;
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Catch" onBack={() => router.back()} />
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
      <ScreenHeader title={`Caught: ${details.name}`} onBack={() => router.back()} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
      >
        <TailTagCard>
          <View style={styles.detailStack}>
            <Pressable
              onPress={() => router.push({ pathname: "/fursuits/[id]", params: { id: details.id } })}
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
                <Pressable onPress={() => setPhotoFullscreen(true)} accessibilityRole="button" accessibilityLabel="View catch photo fullscreen">
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
            {details.bio ? <FursuitBioDetails bio={details.bio} /> : null}
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
            <Pressable style={styles.fullscreenClose} onPress={() => setPhotoFullscreen(false)} accessibilityRole="button" accessibilityLabel="Close fullscreen photo">
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            <Image
              source={record.catchPhotoUrl}
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
  centeredContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  message: {
    color: "rgba(203,213,225,0.9)",
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  detailStack: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    color: "rgba(148,163,184,0.7)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  catchPhoto: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 8,
    backgroundColor: "rgba(30,41,59,0.8)",
  },
  pressed: {
    opacity: 0.7,
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenClose: {
    position: "absolute",
    top: 52,
    right: spacing.lg,
    zIndex: 10,
    padding: spacing.sm,
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
});
