import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../../theme';

type ScreenHeaderProps = {
  title: string;
  onBack: () => void;
  right?: ReactNode;
};

export function ScreenHeader({ title, onBack, right }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.inner}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.leftSlot, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Ionicons name="chevron-back" size={28} color={colors.primary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.rightSlot}>{right ?? null}</View>
      </View>
    </View>
  );
}

const HEADER_HEIGHT = 44;
const SIDE_SLOT_WIDTH = 56;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
  },
  inner: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  leftSlot: {
    width: SIDE_SLOT_WIDTH,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: colors.foreground,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  rightSlot: {
    width: SIDE_SLOT_WIDTH,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
