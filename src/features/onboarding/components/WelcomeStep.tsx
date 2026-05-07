import { Text, View } from 'react-native';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { styles } from './WelcomeStep.styles';

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
          TailTag is a friendly scavenger hunt to find fursuiters. Attend a convention, tag suiters,
          and complete achievements while learning more about the fursuiters you meet!
        </Text>

        <View style={styles.captionBlock}>
          <Text style={styles.captionTitle}>How onboarding works</Text>
          <Text style={styles.captionBody}>
            Pick a convention to attend, list a suit if you have one, enable notifications, then
            claim your first achievement.
          </Text>
        </View>

        <TailTagButton onPress={onContinue}>Let&apos;s Go</TailTagButton>
      </TailTagCard>
    </View>
  );
}
