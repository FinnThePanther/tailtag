import { Stack } from 'expo-router';

import { colors } from '../../src/theme';

export default function ConventionRecapsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="[recapId]" />
    </Stack>
  );
}
