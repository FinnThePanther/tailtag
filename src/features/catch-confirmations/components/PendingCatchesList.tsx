import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { TailTagCard } from '../../../components/ui/TailTagCard';
import { colors, spacing } from '../../../theme';
import type { PendingCatch } from '../types';
import { PendingCatchCard } from './PendingCatchCard';

type PendingCatchesListProps = {
  pendingCatches: PendingCatch[];
  processingCatchId: string | null;
  onAccept: (catchId: string) => void;
  onReject: (catchId: string) => void;
};

export function PendingCatchesList({
  pendingCatches,
  processingCatchId,
  onAccept,
  onReject,
}: PendingCatchesListProps) {
  if (pendingCatches.length === 0) {
    return null;
  }

  return (
    <TailTagCard style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="hourglass-outline" size={18} color="#fbbf24" />
          <Text style={styles.title}>Pending Catch Requests</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{pendingCatches.length}</Text>
        </View>
      </View>
      <Text style={styles.description}>
        These players are waiting for you to approve their catches.
      </Text>
      <View style={styles.list}>
        {pendingCatches.map((pendingCatch, index) => (
          <View
            key={pendingCatch.catchId}
            style={index < pendingCatches.length - 1 ? styles.listItemSpacing : undefined}
          >
            <PendingCatchCard
              pendingCatch={pendingCatch}
              isProcessing={processingCatchId === pendingCatch.catchId}
              onAccept={() => onAccept(pendingCatch.catchId)}
              onReject={() => onReject(pendingCatch.catchId)}
            />
          </View>
        ))}
      </View>
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
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
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
});
