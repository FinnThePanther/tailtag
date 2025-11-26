import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/theme';
import { fetchFursuitTag, nfcTagQueryKey } from '../api/nfcTags';
import { TagStatusBadge } from './TagStatusBadge';

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

  const handleManageTags = () => {
    router.push({
      pathname: '/fursuits/[id]/tags',
      params: { id: fursuitId },
    });
  };

  // Truncate UID for display (show first 4 and last 4 chars)
  const formatUid = (uid: string) => {
    if (uid.length <= 8) return uid;
    return `${uid.slice(0, 4)}...${uid.slice(-4)}`;
  };

  return (
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
            color="rgba(148,163,184,0.6)"
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
            color="rgba(148,163,184,0.6)"
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    color: 'rgba(148,163,184,0.6)',
    fontSize: 14,
  },
  tagCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.5)',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  tagInfo: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  tagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tagUid: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    flex: 1,
  },
  tagDate: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.6)',
    marginLeft: 28, // Align with text after icon
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.3)',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
    borderStyle: 'dashed',
  },
  emptyContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
});
