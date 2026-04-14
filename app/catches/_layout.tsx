import { Stack } from 'expo-router';

import { colors } from '../../src/theme';

export default function CatchesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
