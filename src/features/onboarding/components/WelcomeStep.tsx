import { StyleSheet, Text, View } from 'react-native';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { colors, spacing } from '../../../theme';

type WelcomeStepProps = {
  onContinue: () => void;
};

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
  return (
    <View style={styles.container}>
      <TailTagCard>
        <Text style={styles.eyebrow}>Welcome to TailTag</Text>
        <Text style={styles.title}>Ready to start tagging?</Text>
        <Text style={styles.body}>
          TailTag is a friendly scavenger hunt for fursuiters and fans. Opt into conventions, tag suits,
          and complete achievements to climb the leaderboard.
        </Text>

        <View style={styles.captionBlock}>
          <Text style={styles.captionTitle}>How onboarding works</Text>
          <Text style={styles.captionBody}>
            Pick a convention, optionally register a suit, try a tutorial catch, then claim your first
            achievement.
          </Text>
        </View>

        <TailTagButton onPress={onContinue}>Let&apos;s Go</TailTagButton>
      </TailTagCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 14,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  body: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 16,
    lineHeight: 22,
  },
  captionBlock: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    gap: 6,
  },
  captionTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  captionBody: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 15,
    lineHeight: 21,
  },
});
