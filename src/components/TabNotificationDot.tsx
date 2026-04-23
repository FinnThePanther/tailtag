import { View } from 'react-native';

import { styles } from './TabNotificationDot.styles';

type TabNotificationDotProps = {
  visible: boolean;
};

export function TabNotificationDot({ visible }: TabNotificationDotProps) {
  if (!visible) {
    return null;
  }

  return <View style={styles.dot} />;
}
