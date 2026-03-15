import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { TailTagCard } from '../../../components/ui/TailTagCard';
import { colors, radius, spacing } from '../../../theme';
import { toDisplayDate } from '../../../utils/dates';
import type { MyPendingCatch } from '../types';

type PendingConfirmationsListProps = {
  pendingCatches: MyPendingCatch[];
};

function PendingConfirmationRow({ item }: { item: MyPendingCatch }) {
  const displayDate = toDisplayDate(item.caughtAt);

  return (
    <View style={styles.row}>
      <View style={styles.thumbnail}>
        {item.fursuitAvatarUrl ? (
          <Image source={{ uri: item.fursuitAvatarUrl }} style={styles.thumbnailImage} />
        ) : (
          <View style={styles.thumbnailFallback}>
            <Ionicons name="paw" size={20} color="rgba(148,163,184,0.4)" />
          </View>
        )}
      </View>
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {item.fursuitName}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          Awaiting owner approval
        </Text>
        {displayDate ? (
          <Text style={styles.date} numberOfLines={1}>
            {displayDate} · {item.conventionName}
          </Text>
        ) : (
          <Text style={styles.date} numberOfLines={1}>
            {item.conventionName}
          </Text>
        )}
      </View>
    </View>
  );
}

export function PendingConfirmationsList({ pendingCatches }: PendingConfirmationsListProps) {
  const isEmpty = pendingCatches.length === 0;

  return (
    <TailTagCard style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="time-outline" size={18} color="#fbbf24" />
          <Text style={styles.title}>Pending confirmations</Text>
        </View>
        {!isEmpty && (
          <View
            style={styles.badge}
            accessibilityLabel={`${pendingCatches.length} pending ${pendingCatches.length === 1 ? 'confirmation' : 'confirmations'}`}
            accessibilityRole="text"
          >
            <Text numberOfLines={1} style={styles.badgeText}>
              {pendingCatches.length}
            </Text>
          </View>
        )}
      </View>
      {isEmpty ? (
        <Text style={styles.description}>
          No pending confirmations. When you catch a fursuit that requires owner approval, it will appear here until they approve or decline.
        </Text>
      ) : (
        <>
          <Text style={styles.description}>
            These catches are waiting for the fursuit owner to approve.
          </Text>
          <View style={styles.list}>
            {pendingCatches.map((item, index) => (
              <View
                key={item.catchId}
                style={index < pendingCatches.length - 1 ? styles.listItemSpacing : undefined}
              >
                <PendingConfirmationRow item={item} />
              </View>
            ))}
          </View>
        </>
      )}
    </TailTagCard>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  description: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
    marginBottom: spacing.md,
  },
  list: {
    gap: 0,
  },
  listItemSpacing: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    padding: spacing.md,
  },
  thumbnail: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbnailFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    color: '#fbbf24',
    fontSize: 13,
  },
  date: {
    color: 'rgba(148,163,184,0.7)',
    fontSize: 12,
  },
});
