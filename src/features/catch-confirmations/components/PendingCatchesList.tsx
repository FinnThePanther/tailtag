import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { TailTagCard } from '../../../components/ui/TailTagCard';
import type { PendingCatch } from '../types';
import { PendingCatchCard } from './PendingCatchCard';
import { styles } from './PendingCatchesList.styles';

type PendingCatchesListProps = {
  pendingCatches: PendingCatch[];
  processingCatchId: string | null;
  onAccept: (catchId: string, conventionId?: string) => void;
  onReject: (catchId: string) => void;
};

export function PendingCatchesList({
  pendingCatches,
  processingCatchId,
  onAccept,
  onReject,
}: PendingCatchesListProps) {
  const isEmpty = pendingCatches.length === 0;

  return (
    <TailTagCard style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="hourglass-outline" size={18} color="#fbbf24" />
          <Text style={styles.title}>Pending Catch Requests</Text>
        </View>
        {!isEmpty && (
          <View
            style={styles.badge}
            accessibilityLabel={`${pendingCatches.length} pending ${pendingCatches.length === 1 ? 'catch' : 'catches'}`}
            accessibilityRole="text"
          >
            <Text numberOfLines={1} style={styles.badgeText}>{pendingCatches.length}</Text>
          </View>
        )}
      </View>
      {isEmpty ? (
        <Text style={styles.description}>
          No pending requests right now. When someone catches your suit and you have manual approval enabled, their requests will appear here for you to approve or decline.
        </Text>
      ) : (
        <>
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
                  onAccept={() => onAccept(pendingCatch.catchId, pendingCatch.conventionId)}
                  onReject={() => onReject(pendingCatch.catchId)}
                />
              </View>
            ))}
          </View>
        </>
      )}
    </TailTagCard>
  );
}
