import { Linking, Pressable, Text, View } from 'react-native';
import { TailTagButton } from '../../../components/ui/TailTagButton';
import { useAuth } from '../../auth';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './SuspensionGate.styles';

type SuspensionGateProps = {
  reason: string | null;
  suspendedUntil: string | null;
};

function formatTimeRemaining(until: string): string | null {
  const end = new Date(until);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return null;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}`;
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const minutes = Math.ceil(diff / (1000 * 60));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function SuspensionGate({ reason, suspendedUntil }: SuspensionGateProps) {
  const { forceSignOut } = useAuth();

  const timeRemaining = suspendedUntil ? formatTimeRemaining(suspendedUntil) : null;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons
            name="ban"
            size={48}
            color="#f87171"
          />
        </View>
        <Text style={styles.title}>Account Suspended</Text>

        {reason ? (
          <Text style={styles.reason}>{reason}</Text>
        ) : (
          <Text style={styles.reason}>
            Your account has been suspended for violating our community guidelines.
          </Text>
        )}

        {timeRemaining ? (
          <Text style={styles.duration}>Time remaining: {timeRemaining}</Text>
        ) : suspendedUntil ? null : (
          <Text style={styles.duration}>This suspension is permanent.</Text>
        )}

        <Pressable
          onPress={() =>
            void Linking.openURL('mailto:support@tailtag.app?subject=Account%20Suspension%20Appeal')
          }
        >
          <Text style={styles.contact}>
            If you believe this is an error, contact{' '}
            <Text style={styles.contactLink}>support@tailtag.app</Text>
          </Text>
        </Pressable>

        <TailTagButton
          variant="outline"
          onPress={() => {
            void forceSignOut();
          }}
          style={styles.signOutButton}
        >
          Sign out
        </TailTagButton>
      </View>
    </View>
  );
}
