import { Text, View } from 'react-native';

import { styles } from './TabBadge.styles';

type TabBadgeProps = {
  count: number;
  maxCount?: number;
};

export function TabBadge({ count, maxCount = 99 }: TabBadgeProps) {
  if (count <= 0) {
    return null;
  }

  const displayCount = count > maxCount ? `${maxCount}+` : String(count);

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{displayCount}</Text>
    </View>
  );
}
