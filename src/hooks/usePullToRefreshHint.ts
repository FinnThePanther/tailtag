import { useCallback, useMemo, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const DEFAULT_RELEASE_THRESHOLD = 72;

type PullRefreshHintOptions = {
  isRefreshing: boolean;
  releaseThreshold?: number;
};

export type PullRefreshHintState = 'idle' | 'pulling' | 'ready' | 'refreshing';

export function usePullToRefreshHint({
  isRefreshing,
  releaseThreshold = DEFAULT_RELEASE_THRESHOLD,
}: PullRefreshHintOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const onScrollBeginDrag = useCallback(() => {
    setIsDragging(true);
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setPullDistance(offsetY < 0 ? Math.abs(offsetY) : 0);
  }, []);

  const resetPullState = useCallback(() => {
    setIsDragging(false);
    setPullDistance(0);
  }, []);

  const state = useMemo<PullRefreshHintState>(() => {
    if (isRefreshing) {
      return 'refreshing';
    }

    if (!isDragging || pullDistance <= 0) {
      return 'idle';
    }

    return pullDistance >= releaseThreshold ? 'ready' : 'pulling';
  }, [isDragging, isRefreshing, pullDistance, releaseThreshold]);

  return {
    state,
    onScroll,
    onScrollBeginDrag,
    onScrollEndDrag: resetPullState,
    onMomentumScrollEnd: resetPullState,
  };
}
