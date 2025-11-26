import { Stack } from 'expo-router';

import { colors } from '../../src/theme';

/**
 * Layout for /fursuits/* routes.
 * This passes through to nested layouts without adding its own header.
 */
export default function FursuitsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        navigationBarColor: colors.background,
      }}
    >
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
