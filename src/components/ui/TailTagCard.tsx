import type { ReactNode } from 'react';
import { View, ViewStyle } from 'react-native';

import { styles } from './TailTagCard.styles';

type TailTagCardProps = {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
};

export function TailTagCard({ children, style }: TailTagCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}
