import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { TailTagButton } from '../../../components/ui/TailTagButton';
import { useAuth } from '../../auth';
import { colors, spacing } from '../../../theme';
import { Ionicons } from '@expo/vector-icons';

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
          <Ionicons name="ban" size={48} color="#f87171" />
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
          <Text style={styles.duration}>
            Time remaining: {timeRemaining}
          </Text>
        ) : suspendedUntil ? null : (
          <Text style={styles.duration}>
            This suspension is permanent.
          </Text>
        )}

        <Pressable onPress={() => void Linking.openURL('mailto:support@tailtag.app?subject=Account%20Suspension%20Appeal')}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  content: {
    alignItems: 'center',
    gap: spacing.md,
    maxWidth: 340,
  },
  iconContainer: {
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  reason: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  duration: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  contact: {
    color: 'rgba(148,163,184,0.8)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  contactLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  signOutButton: {
    marginTop: spacing.lg,
    minWidth: 160,
  },
});
