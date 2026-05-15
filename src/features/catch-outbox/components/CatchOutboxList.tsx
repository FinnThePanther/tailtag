import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppAvatar } from '@/components/ui/AppAvatar';
import { TailTagButton } from '@/components/ui/TailTagButton';
import { TailTagCard } from '@/components/ui/TailTagCard';
import type { CatchOutboxItem } from '@/features/catch-outbox/types';
import { styles } from '@/features/catch-outbox/components/CatchOutboxList.styles';

type CatchOutboxListProps = {
  items: CatchOutboxItem[];
  compact?: boolean;
  onRetry?: (clientAttemptId: string) => void;
  onDismiss?: (clientAttemptId: string) => void;
  onEditCode?: (item: CatchOutboxItem) => void;
};

function statusLabel(item: CatchOutboxItem) {
  switch (item.status) {
    case 'queued':
      return 'Queued';
    case 'uploading':
      return 'Uploading';
    case 'syncing':
      return 'Syncing';
    case 'confirmed':
      return 'Caught';
    case 'pending_approval':
      return 'Pending approval';
    case 'failed':
      return 'Needs attention';
  }
}

function statusIcon(item: CatchOutboxItem) {
  switch (item.status) {
    case 'confirmed':
      return 'checkmark-circle';
    case 'pending_approval':
      return 'time';
    case 'failed':
      return 'alert-circle';
    case 'uploading':
    case 'syncing':
      return 'sync';
    case 'queued':
      return 'cloud-upload-outline';
  }
}

function subtitleFor(item: CatchOutboxItem) {
  if (item.status === 'failed') {
    return item.errorMessage ?? "We couldn't sync this catch.";
  }

  if (item.status === 'queued') {
    if (item.method === 'camera_photo' || item.method === 'gallery_photo') {
      return "We'll upload this photo when your connection improves.";
    }

    return "We'll finish this when your connection improves.";
  }

  if (item.status === 'uploading' || item.status === 'syncing') {
    if (item.method === 'camera_photo' || item.method === 'gallery_photo') {
      return 'Uploading catch photo...';
    }

    return 'Sending to TailTag...';
  }

  if (item.status === 'pending_approval') {
    return 'Waiting for the owner to approve.';
  }

  return 'Synced to your caught collection.';
}

type CatchOutboxRowProps = Pick<CatchOutboxListProps, 'onRetry' | 'onDismiss' | 'onEditCode'> & {
  item: CatchOutboxItem;
};

function CatchOutboxRow({ item, onRetry, onDismiss, onEditCode }: CatchOutboxRowProps) {
  const displayName =
    item.fursuitName ?? (item.fursuitCode ? `Code ${item.fursuitCode}` : 'Photo catch');
  const canAct = item.status === 'failed';
  const canEditCode = item.method === 'code' && Boolean(onEditCode);

  return (
    <View style={styles.row}>
      <AppAvatar
        url={item.fursuitAvatarUrl ?? null}
        size="md"
        fallback="fursuit"
      />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text
            style={styles.name}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <View style={styles.statusPill}>
            <Ionicons
              name={statusIcon(item)}
              size={14}
              color={item.status === 'failed' ? '#fca5a5' : '#93c5fd'}
            />
            <Text
              style={styles.statusText}
              numberOfLines={1}
            >
              {statusLabel(item)}
            </Text>
          </View>
        </View>
        <Text
          style={styles.subtitle}
          numberOfLines={2}
        >
          {subtitleFor(item)}
        </Text>
        {canAct ? (
          <View style={styles.actions}>
            <TailTagButton
              size="sm"
              variant="outline"
              onPress={() => onRetry?.(item.clientAttemptId)}
            >
              Retry
            </TailTagButton>
            {item.method === 'code' ? (
              <TailTagButton
                size="sm"
                variant="ghost"
                disabled={!canEditCode}
                onPress={() => onEditCode?.(item)}
              >
                Edit code
              </TailTagButton>
            ) : null}
            <TailTagButton
              size="sm"
              variant="ghost"
              onPress={() => onDismiss?.(item.clientAttemptId)}
            >
              Dismiss
            </TailTagButton>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function CatchOutboxList({
  items,
  compact = false,
  onRetry,
  onDismiss,
  onEditCode,
}: CatchOutboxListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <TailTagCard style={compact ? styles.compactContainer : styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Ionicons
            name="cloud-upload-outline"
            size={18}
            color="#93c5fd"
          />
          <Text style={styles.title}>Syncing catches</Text>
        </View>
        <View
          style={styles.badge}
          accessibilityRole="text"
          accessibilityLabel={`${items.length} catch ${items.length === 1 ? 'item needs' : 'items need'} sync attention`}
        >
          <Text style={styles.badgeText}>{items.length}</Text>
        </View>
      </View>
      <Text style={styles.description}>
        Queued catches and photo uploads are saved on this device and finish when TailTag accepts
        them.
      </Text>
      <View style={styles.list}>
        {items.map((item, index) => (
          <View
            key={item.clientAttemptId}
            style={index < items.length - 1 ? styles.listItemSpacing : undefined}
          >
            <CatchOutboxRow
              item={item}
              onRetry={onRetry}
              onDismiss={onDismiss}
              onEditCode={onEditCode}
            />
          </View>
        ))}
      </View>
    </TailTagCard>
  );
}
