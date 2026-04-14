import { StyleSheet } from 'react-native';

import { colors, spacing, surfacePrimitives } from '../../theme';

export const styles = StyleSheet.create({
  card: {
    ...surfacePrimitives.card,
    backgroundColor: colors.surfaceCard,
    padding: spacing.lg,
  },
});
