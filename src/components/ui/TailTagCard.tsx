import type { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { radius, spacing } from '../../theme';

type TailTagCardProps = {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
};

export function TailTagCard({ children, style }: TailTagCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(15,23,42,0.82)',
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
});
