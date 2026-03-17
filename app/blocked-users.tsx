import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { BlockedUsersScreen } from '../src/features/moderation';
import { colors } from '../src/theme';

export default function BlockedUsersRoute() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Blocked Users" onBack={() => router.back()} />
      <BlockedUsersScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
