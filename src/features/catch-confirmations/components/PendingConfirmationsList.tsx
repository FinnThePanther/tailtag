import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppAvatar } from '../../../components/ui/AppAvatar';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { toDisplayDate } from '../../../utils/dates';
import type { MyPendingCatch } from '../types';
import { styles } from './PendingConfirmationsList.styles';

type PendingConfirmationsListProps = {
  pendingCatches: MyPendingCatch[];
};

function PendingConfirmationRow({ item }: { item: MyPendingCatch }) {
  const displayDate = toDisplayDate(item.caughtAt);

  return (
    <View style={styles.row}>
      <AppAvatar url={item.fursuitAvatarUrl} size="md" fallback="fursuit" />
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
