import { Stack } from 'expo-router';

import { colors } from '../../src/theme';

/**
 * Layout for /profile/* routes.
 * Passes through to nested layouts without adding its own header.
 */
export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="[id]/index" />
    </Stack>
  );
}
