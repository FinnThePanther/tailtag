import { Text, View } from 'react-native';

import { styles } from './PullToRefreshHint.styles';
import type { PullRefreshHintState } from '../../hooks/usePullToRefreshHint';

type PullToRefreshHintProps = {
  state: PullRefreshHintState;
};

const LABELS: Record<PullRefreshHintState, string> = {
  idle: '',
  pulling: 'Pull to refresh',
  ready: 'Release to refresh',
  refreshing: 'Refreshing...',
};

export function PullToRefreshHint({ state }: PullToRefreshHintProps) {
  if (state === 'idle') {
    return null;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      style={styles.container}
    >
      <Text style={styles.text}>{LABELS[state]}</Text>
    </View>
  );
}
