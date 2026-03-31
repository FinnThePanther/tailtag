import { useCallback, useState } from "react";
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { AppImage } from "../../../components/ui/AppImage";
import { TailTagButton } from "../../../components/ui/TailTagButton";
import { radius, spacing } from "../../../theme";
import { inferImageExtension, inferImageMimeType } from "../../../utils/images";
import type { CatchOfFursuitItem } from "../api/catchesByFursuit";

const SCREEN_WIDTH = Dimensions.get("window").width;

type CatchPhotosListProps = {
  items: CatchOfFursuitItem[];
};

export function CatchPhotosList({ items }: CatchPhotosListProps) {
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const withPhoto = items.filter(
    (item): item is CatchOfFursuitItem & { catch_photo_url: string } =>
      Boolean(item.catch_photo_url?.trim()),
  );

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
      await Sharing.shareAsync(file.uri, {
        mimeType,
        dialogTitle: "Save catch photo",
      });
    } catch {
      Alert.alert(
        "Download failed",
        "Could not download the photo. Please try again.",
      );
    } finally {
      setIsDownloading(false);
    }
  }, []);

  if (withPhoto.length === 0) {
    return null;
  }

  return (
    <>
      <View style={styles.grid}>
        {withPhoto.map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.thumbnailWrap,
              pressed && styles.thumbnailPressed,
            ]}
            onPress={() => setFullscreenUrl(item.catch_photo_url)}
            accessibilityRole="button"
            accessibilityLabel="View catch photo fullscreen"
          >
            <AppImage
              url={item.catch_photo_url}
              width={SCREEN_WIDTH * 0.31}
              height={SCREEN_WIDTH * 0.31}
              style={styles.thumbnail}
              accessibilityLabel="Catch photo thumbnail"
            />
          </Pressable>
        ))}
      </View>

      {fullscreenUrl ? (
        <Modal
          visible={Boolean(fullscreenUrl)}
          transparent
          animationType="fade"
          onRequestClose={() => setFullscreenUrl(null)}
          statusBarTranslucent
        >
          <StatusBar hidden />
          <View style={styles.fullscreenBackdrop}>
            <Pressable
              style={styles.fullscreenClose}
              onPress={() => setFullscreenUrl(null)}
              accessibilityRole="button"
              accessibilityLabel="Close fullscreen photo"
            >
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            <Image
              source={fullscreenUrl}
              style={styles.fullscreenImage}
              contentFit="contain"
              accessibilityLabel="Catch photo fullscreen"
            />
            <View style={styles.fullscreenActions}>
              <TailTagButton
                variant="outline"
                size="sm"
                loading={isDownloading}
                onPress={() => void handleDownloadPhoto(fullscreenUrl)}
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

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  thumbnailWrap: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "rgba(30,41,59,0.8)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
  },
  thumbnailPressed: {
    opacity: 0.8,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
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
  fullscreenActions: {
    position: "absolute",
    bottom: 48,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
  },
});
