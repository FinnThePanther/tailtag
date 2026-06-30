import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { styles } from '@/app-styles/(tabs)/suits/reorder.styles';
import { AppAvatar } from '@/components/ui/AppAvatar';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TailTagButton } from '@/components/ui/TailTagButton';
import { useAuth } from '@/features/auth';
import {
  fetchMySuits,
  MY_SUITS_STALE_TIME,
  mySuitsQueryKey,
  queueMySuitsOrderSync,
  syncMySuitsOrder,
  type FursuitSummary,
} from '@/features/suits';
import { useToast } from '@/hooks/useToast';
import { captureHandledException } from '@/lib/sentry';
import { getUserVisibleErrorMessage } from '@/lib/userVisibleErrors';
import { colors, spacing } from '@/theme';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sameIdSet(left: FursuitSummary[], right: FursuitSummary[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightIds = new Set(right.map((item) => item.id));
  return left.every((item) => rightIds.has(item.id));
}

function mergeLatestSuitData(
  orderedItems: FursuitSummary[],
  latestItems: FursuitSummary[],
): FursuitSummary[] {
  const latestById = new Map(latestItems.map((item) => [item.id, item]));

  return orderedItems.map((item) => latestById.get(item.id) ?? item);
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  if (!item) {
    return items;
  }

  next.splice(toIndex, 0, item);
  return next;
}

function withDisplayOrder(items: FursuitSummary[]) {
  return items.map((item, index) => ({
    ...item,
    display_order: index,
  }));
}

type ReorderRowProps = {
  suit: FursuitSummary;
  index: number;
  disabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (suitId: string, direction: -1 | 1) => void;
};

function ReorderRow({ suit, index, disabled, isFirst, isLast, onMove }: ReorderRowProps) {
  const isHiddenSuit = suit.ownerAttributionVisibility === 'hidden';

  return (
    <View style={styles.row}>
      <Text style={styles.rank}>{index + 1}</Text>
      <AppAvatar
        url={suit.avatar_url}
        size="md"
        fallback="fursuit"
        accessibilityLabel={`${suit.name} avatar`}
      />
      <View style={styles.rowText}>
        <View style={styles.nameLine}>
          <Text
            style={styles.name}
            numberOfLines={1}
          >
            {suit.name}
          </Text>
          {isHiddenSuit ? (
            <View
              accessibilityLabel="Hidden suit"
              style={styles.hiddenBadge}
            >
              <Text style={styles.hiddenBadgeText}>Hidden</Text>
            </View>
          ) : null}
        </View>
        <Text
          style={styles.species}
          numberOfLines={1}
        >
          {suit.species ?? 'Species not set yet'}
        </Text>
      </View>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Move ${suit.name} up`}
          disabled={disabled || isFirst}
          hitSlop={8}
          onPress={() => onMove(suit.id, -1)}
          style={({ pressed }) => [
            styles.iconButton,
            (disabled || isFirst) && styles.iconButtonDisabled,
            pressed && !disabled && !isFirst ? styles.iconButtonPressed : null,
          ]}
        >
          <Ionicons
            name="chevron-up"
            size={18}
            color={isFirst ? colors.textSubtle : colors.foreground}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Move ${suit.name} down`}
          disabled={disabled || isLast}
          hitSlop={8}
          onPress={() => onMove(suit.id, 1)}
          style={({ pressed }) => [
            styles.iconButton,
            (disabled || isLast) && styles.iconButtonDisabled,
            pressed && !disabled && !isLast ? styles.iconButtonPressed : null,
          ]}
        >
          <Ionicons
            name="chevron-down"
            size={18}
            color={isLast ? colors.textSubtle : colors.foreground}
          />
        </Pressable>
      </View>
    </View>
  );
}

export default function ReorderSuitsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { showToast } = useToast();
  const userId = session?.user.id ?? null;
  const suitsQueryKey = useMemo(() => mySuitsQueryKey(userId ?? 'guest'), [userId]);
  const confirmedBackRef = useRef(false);
  const [orderedSuits, setOrderedSuits] = useState<FursuitSummary[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    data: suits = [],
    error,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<FursuitSummary[], Error>({
    queryKey: suitsQueryKey,
    enabled: Boolean(userId),
    staleTime: MY_SUITS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchMySuits(userId!),
  });

  useEffect(() => {
    if (!isDirty) {
      if (orderedSuits !== suits) {
        setOrderedSuits(suits);
      }
      return;
    }

    if (!sameIdSet(orderedSuits, suits)) {
      setOrderedSuits(suits);
      setIsDirty(false);
      return;
    }

    const latestOrderedSuits = mergeLatestSuitData(orderedSuits, suits);
    if (latestOrderedSuits.some((suit, index) => suit !== orderedSuits[index])) {
      setOrderedSuits(latestOrderedSuits);
    }
  }, [isDirty, orderedSuits, suits]);

  const confirmDiscardChanges = useCallback((onDiscard: () => void) => {
    Alert.alert('Discard order changes?', 'Your saved fursuit order will stay the same.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: onDiscard,
      },
    ]);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!isDirty || isSaving) {
        confirmedBackRef.current = false;
        return;
      }

      if (confirmedBackRef.current) {
        confirmedBackRef.current = false;
        return;
      }

      event.preventDefault();
      confirmDiscardChanges(() => {
        confirmedBackRef.current = true;
        navigation.dispatch(event.data.action);
      });
    });

    return unsubscribe;
  }, [confirmDiscardChanges, isDirty, isSaving, navigation]);

  const handleBack = useCallback(() => {
    if (isSaving) {
      return;
    }

    if (!isDirty) {
      router.back();
      return;
    }

    confirmDiscardChanges(() => {
      confirmedBackRef.current = true;
      router.back();
    });
  }, [confirmDiscardChanges, isDirty, isSaving, router]);

  const handleMove = useCallback((suitId: string, direction: -1 | 1) => {
    setSubmitError(null);
    setOrderedSuits((current) => {
      const fromIndex = current.findIndex((item) => item.id === suitId);
      const toIndex = clamp(fromIndex + direction, 0, current.length - 1);

      if (fromIndex < 0 || fromIndex === toIndex) {
        return current;
      }

      setIsDirty(true);
      return withDisplayOrder(moveItem(current, fromIndex, toIndex));
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!userId || orderedSuits.length < 2 || !isDirty || isSaving) {
      return;
    }

    const nextOrder = withDisplayOrder(orderedSuits);
    const fursuitIds = nextOrder.map((suit) => suit.id);

    setIsSaving(true);
    setSubmitError(null);

    try {
      await queryClient.cancelQueries({ queryKey: suitsQueryKey });
      queryClient.setQueryData(suitsQueryKey, nextOrder);
      await queueMySuitsOrderSync({
        userId,
        fursuitIds,
      });
      setOrderedSuits(nextOrder);
      setIsDirty(false);
      showToast('Fursuit order saved.');
      confirmedBackRef.current = true;
      router.back();
      void syncMySuitsOrder({ userId }).catch((syncError) => {
        captureHandledException(syncError, {
          scope: 'suits.reorder.backgroundSyncAfterSave',
          additionalContext: {
            userId,
            fursuitIds,
          },
        });
      });
    } catch (saveError) {
      captureHandledException(saveError, {
        scope: 'suits.reorder.save',
        additionalContext: {
          userId,
          fursuitIds,
        },
      });
      setSubmitError(getUserVisibleErrorMessage(saveError, "We couldn't save your order."));
    } finally {
      setIsSaving(false);
    }
  }, [isDirty, isSaving, orderedSuits, queryClient, router, showToast, suitsQueryKey, userId]);

  const hasSuitsToReorder = orderedSuits.length > 1;
  const combinedError = error
    ? getUserVisibleErrorMessage(error, "We couldn't load your fursuits.")
    : null;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Fursuit order"
        onBack={handleBack}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save fursuit order"
            disabled={!hasSuitsToReorder || !isDirty || isSaving}
            onPress={handleSave}
            hitSlop={8}
            style={({ pressed }) => [
              pressed && !isSaving && isDirty ? styles.headerButtonPressed : null,
              (!hasSuitsToReorder || !isDirty || isSaving) && styles.headerButtonDisabled,
            ]}
          >
            <Text style={styles.headerButton}>{isSaving ? 'Saving' : 'Save'}</Text>
          </Pressable>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading ? (
          <Text style={styles.message}>Loading your suits...</Text>
        ) : combinedError ? (
          <View style={styles.messageBlock}>
            <Text style={styles.error}>{combinedError}</Text>
            <TailTagButton
              variant="outline"
              size="sm"
              onPress={() => void refetch()}
            >
              Try again
            </TailTagButton>
          </View>
        ) : hasSuitsToReorder ? (
          <View style={styles.list}>
            {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
            {orderedSuits.map((suit, index) => (
              <ReorderRow
                key={suit.id}
                suit={suit}
                index={index}
                disabled={isSaving}
                isFirst={index === 0}
                isLast={index === orderedSuits.length - 1}
                onMove={handleMove}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.message}>Add another fursuit before changing the order.</Text>
        )}
      </ScrollView>
    </View>
  );
}
