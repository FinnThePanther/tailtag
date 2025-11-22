import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { TailTagInput } from '../../../components/ui/TailTagInput';
import { SkipButton } from './SkipButton';
import { recordTutorialCatch } from '../../onboarding';
import { colors, spacing } from '../../../theme';
import { normalizeUniqueCodeInput } from '../../../utils/code';

type TutorialCatchStepProps = {
  userId: string;
  onComplete: (options: { recorded: boolean }) => void;
  onSkip: () => void;
};

export function TutorialCatchStep({ userId, onComplete, onSkip }: TutorialCatchStepProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');

  const normalizedCode = useMemo(() => normalizeUniqueCodeInput(codeInput), [codeInput]);
  const isCodeValid = normalizedCode === 'TEST';

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    if (!isCodeValid) {
      setSubmitError('Enter the practice code TEST to continue.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await recordTutorialCatch(userId);
      onComplete({ recorded: true });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "We couldn't log the practice catch. Please try again.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <TailTagCard>
        <Text style={styles.eyebrow}>Step 4</Text>
        <Text style={styles.title}>Practice your first catch</Text>
        <Text style={styles.body}>
          Meet TailTag Trainer, our tutorial suit. Enter the practice code <Text style={styles.code}>TEST</Text>{" "}
          to simulate a scan and see how catches are logged. You can skip if you already feel confident.
        </Text>

        <TailTagInput
          value={codeInput}
          onChangeText={(value) => {
            setCodeInput(value);
            setSubmitError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Enter TEST"
          editable={!isSubmitting}
        />

        {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

        <View style={styles.ctaRow}>
          <SkipButton onPress={onSkip} disabled={isSubmitting} style={styles.fullWidthCta} />
          <TailTagButton
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
            style={styles.fullWidthCta}
          >
            Catch Trainer
          </TailTagButton>
        </View>
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
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  body: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  ctaRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  fullWidthCta: {
    alignSelf: 'stretch',
  },
  error: {
    color: colors.destructive,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  code: {
    color: colors.primary,
    fontWeight: '700',
  },
});
