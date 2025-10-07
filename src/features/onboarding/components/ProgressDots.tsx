import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../theme';

type ProgressDotsProps = {
  currentIndex: number;
  total: number;
};

export function ProgressDots({ currentIndex, total }: ProgressDotsProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: total }, (_item, index) => {
        const isActive = index === currentIndex;
        return <View key={index} style={[styles.dot, isActive ? styles.dotActive : null]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(148,163,184,0.35)',
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
});
