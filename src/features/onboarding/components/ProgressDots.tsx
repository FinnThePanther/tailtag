import { View } from 'react-native';

import { styles } from './ProgressDots.styles';

type ProgressDotsProps = {
  currentIndex: number;
  total: number;
};

export function ProgressDots({ currentIndex, total }: ProgressDotsProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: total }, (_item, index) => {
        const isActive = index === currentIndex;
        return (
          <View
            key={index}
            style={[styles.dot, isActive ? styles.dotActive : null]}
          />
        );
      })}
    </View>
  );
}
