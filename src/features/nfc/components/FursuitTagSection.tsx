import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import { fetchFursuitTag, nfcTagQueryKey, fetchFursuitQrTag, fursuitQrQueryKey } from '../api/nfcTags';
import { TagStatusBadge } from './TagStatusBadge';
import { TailTagButton } from '@/components/ui/TailTagButton';
import { styles } from './FursuitTagSection.styles';

type FursuitTagSectionProps = {
  fursuitId: string;
};

/**
 * Section displayed on fursuit detail screen for owners.
 * Shows current NFC tag status and link to manage tags.
 */
export function FursuitTagSection({ fursuitId }: FursuitTagSectionProps) {
  const router = useRouter();

  const { data: tag, isLoading } = useQuery({
    queryKey: nfcTagQueryKey(fursuitId),
    queryFn: () => fetchFursuitTag(fursuitId),
    staleTime: 2 * 60_000,
  });

  const { data: qrTag } = useQuery({
    queryKey: fursuitQrQueryKey(fursuitId),
    queryFn: () => fetchFursuitQrTag(fursuitId),
    staleTime: 2 * 60_000,
  });

  const handleManageTags = () => {
    router.push({
      pathname: '/fursuits/[id]/tags',
      params: { id: fursuitId },
    });
  };

  const handleShowQr = () => {
    router.push({
      pathname: '/show-qr',
      params: { initialFursuitId: fursuitId },
    });
  };

  // Truncate UID for display (show first 4 and last 4 chars)
  const formatUid = (uid: string) => {
    if (uid.length <= 8) return uid;
    return `${uid.slice(0, 4)}...${uid.slice(-4)}`;
  };

  return (
    <View style={styles.sectionGroup}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>NFC Tag</Text>

        {isLoading ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : tag ? (
          <Pressable style={styles.tagCard} onPress={handleManageTags}>
            <View style={styles.tagInfo}>
              <View style={styles.tagHeader}>
                <Ionicons name="radio-outline" size={20} color={colors.primary} />
                <Text style={styles.tagUid}>{formatUid(tag.uid)}</Text>
                <TagStatusBadge status={tag.status} />
              </View>
              {tag.linkedAt && (
                <Text style={styles.tagDate}>
                  Linked {new Date(tag.linkedAt).toLocaleDateString()}
                </Text>
              )}
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.textFaint}
            />
          </Pressable>
        ) : (
          <Pressable style={styles.emptyCard} onPress={handleManageTags}>
            <View style={styles.emptyContent}>
              <Ionicons
                name="add-circle-outline"
                size={24}
                color={colors.primary}
              />
              <Text style={styles.emptyText}>Register an NFC tag</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.textFaint}
            />
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>QR Tag</Text>
        {qrTag?.qrToken ? (
          <>
            <Pressable style={styles.qrCard} onPress={handleManageTags}>
              <View style={styles.tagInfo}>
                <View style={styles.tagHeader}>
                  <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
                  <Text style={styles.qrLabel}>Ready to scan</Text>
                  <TagStatusBadge status={qrTag.status} />
                </View>
                {qrTag.qrTokenCreatedAt ? (
                  <Text style={styles.tagDate}>
                    Generated {new Date(qrTag.qrTokenCreatedAt).toLocaleDateString()}
                  </Text>
                ) : null}
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textFaint}
              />
            </Pressable>
            <View style={styles.qrActions}>
              <TailTagButton variant="outline" size="sm" style={styles.showQrButton} onPress={handleShowQr}>
                Show My QR
              </TailTagButton>
              <TailTagButton variant="ghost" size="sm" onPress={handleManageTags}>
                Manage QR
              </TailTagButton>
            </View>
          </>
        ) : (
          <Pressable style={[styles.emptyCard, styles.qrEmptyCard]} onPress={handleManageTags}>
            <View style={styles.emptyContent}>
              <Ionicons name="qr-code-outline" size={24} color={colors.primary} />
              <Text style={styles.emptyText}>Register a QR tag</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
