import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { styles } from '@/app-styles/(tabs)/suits/reorder.styles';
import { AppAvatar } from '@/components/ui/AppAvatar';
import { TailTagButton } from '@/components/ui/TailTagButton';
import { useAuth } from '@/features/auth';
import {
  fetchMySuits,
  MY_SUITS_QUERY_KEY,
  MY_SUITS_STALE_TIME,
  mySuitsQueryKey,
  reorderMySuits,
  type FursuitSummary,
} from '@/features/suits';
import { useToast } from '@/hooks/useToast';
import { getUserVisibleErrorMessage } from '@/lib/userVisibleErrors';
import { colors, spacing } from '@/theme';

const ROW_HEIGHT = 88;
const ROW_GAP = 12;
const ROW_STRIDE = ROW_HEIGHT + ROW_GAP;

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
  top: number;
  disabled: boolean;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
  dragY: Animated.Value;
  onDragStart: (index: number, suitId: string) => void;
  onDragMove: (dy: number) => void;
  onDragEnd: () => void;
  onMove: (suitId: string, direction: -1 | 1) => void;
};

function ReorderRow({
  suit,
  index,
  top,
  disabled,
  isActive,
  isFirst,
  isLast,
  dragY,
  onDragStart,
  onDragMove,
  onDragEnd,
  onMove,
}: ReorderRowProps) {
  const isHiddenSuit = suit.ownerAttributionVisibility === 'hidden';
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: (_, gesture) =>
          !disabled && (Math.abs(gesture.dy) > 2 || Math.abs(gesture.dx) > 2),
        onPanResponderGrant: () => onDragStart(index, suit.id),
        onPanResponderMove: (_, gesture) => onDragMove(gesture.dy),
        onPanResponderRelease: onDragEnd,
        onPanResponderTerminate: onDragEnd,
      }),
    [disabled, index, onDragEnd, onDragMove, onDragStart, suit.id],
  );

  return (
    <Animated.View
      style={[
        styles.rowPosition,
        {
          top,
          transform: isActive ? [{ translateY: dragY }] : undefined,
          zIndex: isActive ? 10 : 1,
          elevation: isActive ? 6 : 0,
        },
      ]}
    >
      <View style={[styles.row, isActive ? styles.rowActive : null]}>
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
          <View
            accessibilityRole="adjustable"
            accessibilityLabel={`Drag ${suit.name}`}
            style={[styles.dragHandle, disabled ? styles.iconButtonDisabled : null]}
            {...panResponder.panHandlers}
          >
            <Ionicons
              name="reorder-three"
              size={24}
              color={disabled ? colors.textSubtle : colors.primary}
            />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

export default function ReorderSuitsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { showToast } = useToast();
  const userId = session?.user.id ?? null;
  const suitsQueryKey = useMemo(() => mySuitsQueryKey(userId ?? 'guest'), [userId]);
  const dragY = useRef(new Animated.Value(0)).current;
  const dragStartIndexRef = useRef(0);
  const dragCurrentIndexRef = useRef(0);
  const draggingIdRef = useRef<string | null>(null);
  const [orderedSuits, setOrderedSuits] = useState<FursuitSummary[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
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
    if (draggingId) {
      return;
    }

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
  }, [draggingId, isDirty, orderedSuits, suits]);

  const handleBack = useCallback(() => {
    if (!isDirty || isSaving) {
      router.back();
      return;
    }

    Alert.alert('Discard order changes?', 'Your saved fursuit order will stay the same.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => router.back(),
      },
    ]);
  }, [isDirty, isSaving, router]);

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

  const handleDragStart = useCallback(
    (index: number, suitId: string) => {
      if (isSaving) {
        return;
      }

      setSubmitError(null);
      dragY.stopAnimation();
      dragY.setValue(0);
      dragStartIndexRef.current = index;
      dragCurrentIndexRef.current = index;
      draggingIdRef.current = suitId;
      setDraggingId(suitId);
    },
    [dragY, isSaving],
  );

  const handleDragMove = useCallback(
    (dy: number) => {
      const suitId = draggingIdRef.current;
      if (!suitId) {
        return;
      }

      dragY.setValue(dy);
      const targetIndex = clamp(
        Math.round((dragStartIndexRef.current * ROW_STRIDE + dy) / ROW_STRIDE),
        0,
        orderedSuits.length - 1,
      );

      if (targetIndex === dragCurrentIndexRef.current) {
        return;
      }

      setOrderedSuits((current) => {
        const currentIndex = current.findIndex((item) => item.id === suitId);
        if (currentIndex < 0) {
          return current;
        }

        dragCurrentIndexRef.current = targetIndex;
        setIsDirty(true);
        return withDisplayOrder(moveItem(current, currentIndex, targetIndex));
      });
    },
    [dragY, orderedSuits.length],
  );

  const handleDragEnd = useCallback(() => {
    draggingIdRef.current = null;
    setDraggingId(null);
    dragY.setValue(0);
  }, [dragY]);

  const handleSave = useCallback(async () => {
    if (!userId || orderedSuits.length < 2 || !isDirty || isSaving) {
      return;
    }

    const nextOrder = withDisplayOrder(orderedSuits);
    const previous = queryClient.getQueryData<FursuitSummary[]>(suitsQueryKey);

    setIsSaving(true);
    setSubmitError(null);
    await queryClient.cancelQueries({ queryKey: suitsQueryKey });
    queryClient.setQueryData(suitsQueryKey, nextOrder);

    try {
      await reorderMySuits(nextOrder.map((suit) => suit.id));
      setOrderedSuits(nextOrder);
      setIsDirty(false);
      showToast('Fursuit order saved.');
      await queryClient.invalidateQueries({ queryKey: [MY_SUITS_QUERY_KEY, userId] });
      router.back();
    } catch (saveError) {
      if (previous) {
        queryClient.setQueryData(suitsQueryKey, previous);
      }
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
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
        },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          disabled={isSaving}
          hitSlop={8}
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && !isSaving ? styles.iconButtonPressed : null,
          ]}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={colors.foreground}
          />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Your suits</Text>
          <Text style={styles.title}>Fursuit order</Text>
        </View>
        <TailTagButton
          size="sm"
          loading={isSaving}
          disabled={!hasSuitsToReorder || !isDirty || isSaving}
          onPress={handleSave}
        >
          Save
        </TailTagButton>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!draggingId}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            enabled={!draggingId}
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
          <>
            {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
            <View
              style={[styles.listStage, { height: orderedSuits.length * ROW_STRIDE - ROW_GAP }]}
            >
              {orderedSuits.map((suit, index) => (
                <ReorderRow
                  key={suit.id}
                  suit={suit}
                  index={index}
                  top={
                    draggingId === suit.id
                      ? dragStartIndexRef.current * ROW_STRIDE
                      : index * ROW_STRIDE
                  }
                  disabled={isSaving}
                  isActive={draggingId === suit.id}
                  isFirst={index === 0}
                  isLast={index === orderedSuits.length - 1}
                  dragY={dragY}
                  onDragStart={handleDragStart}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEnd}
                  onMove={handleMove}
                />
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.message}>Add another fursuit before changing the order.</Text>
        )}
      </ScrollView>
    </View>
  );
}
