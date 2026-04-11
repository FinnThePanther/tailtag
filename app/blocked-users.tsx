import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { BlockedUsersScreen } from '../src/features/moderation';
import { styles } from '../src/app-styles/blocked-users.styles';

export default function BlockedUsersRoute() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Blocked Users"
        onBack={() => router.back()}
      />
      <BlockedUsersScreen />
    </View>
  );
}
