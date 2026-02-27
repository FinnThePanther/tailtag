import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { TailTagButton } from "../../../components/ui/TailTagButton";
import { TailTagCard } from "../../../components/ui/TailTagCard";
import { TailTagInput } from "../../../components/ui/TailTagInput";
import { FursuitCard, FursuitBioDetails } from "../../suits";
import { SkipButton } from "./SkipButton";
import { recordTutorialCatch, type TutorialCatchResult } from "../../onboarding";
import { colors, spacing } from "../../../theme";
import { normalizeUniqueCodeInput } from "../../../utils/code";

type TutorialCatchStepProps = {
  userId: string;
  onComplete: (options: { recorded: boolean }) => void;
  onSkip: () => void;
};

export function TutorialCatchStep({
  userId,
  onComplete,
  onSkip,
}: TutorialCatchStepProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [catchResult, setCatchResult] = useState<TutorialCatchResult | null>(null);

  const normalizedCode = useMemo(
    () => normalizeUniqueCodeInput(codeInput),
    [codeInput],
  );
  const isCodeValid = normalizedCode === "TEST";

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    if (!isCodeValid) {
      setSubmitError("Enter the practice code TEST to continue.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await recordTutorialCatch(userId);
      setCatchResult(result);
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

  if (catchResult) {
    const conversationPrompt = catchResult.bio?.askMeAbout?.trim() ||
      catchResult.bio?.likesAndInterests?.trim() || null;

    return (
      <View style={styles.container}>
        <TailTagCard>
          <Text style={styles.resultTitle}>Nice catch!</Text>
          <Text style={[styles.body, styles.resultHighlight]}>
            You just caught {catchResult.name}!
          </Text>
          <Text style={styles.body}>
            This is what it looks like when you catch a fursuit. Check out their
            info below — in a real catch, you can learn about the fursuiter and
            start a conversation.
          </Text>

          {conversationPrompt ? (
            <TailTagCard style={styles.promptCard}>
              <Text style={styles.promptLabel}>Ask them about…</Text>
              <Text style={styles.promptBody}>{conversationPrompt}</Text>
            </TailTagCard>
          ) : null}

          <FursuitCard
            name={catchResult.name}
            species={catchResult.species}
            colors={catchResult.colors}
            avatarUrl={catchResult.avatarUrl}
            uniqueCode={catchResult.uniqueCode}
            timelineLabel="Caught just now"
          />

          {catchResult.bio ? (
            <View style={styles.bioSpacing}>
              <TailTagCard>
                <FursuitBioDetails bio={catchResult.bio} />
              </TailTagCard>
            </View>
          ) : null}

          <TailTagButton
            onPress={() => onComplete({ recorded: true })}
            style={styles.continueButton}
          >
            Continue
          </TailTagButton>
        </TailTagCard>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TailTagCard>
        <Text style={styles.eyebrow}>Step 4</Text>
        <Text style={styles.title}>Learn how to catch a fursuit</Text>
        <Text style={styles.body}>
          Meet TailTag Trainer, our tutorial suit. Enter the practice code{" "}
          <Text style={styles.code}>TEST</Text> to simulate a catch. You can
          skip if you already feel confident.
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
          <SkipButton
            onPress={onSkip}
            disabled={isSubmitting}
            style={styles.fullWidthCta}
          />
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
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  resultTitle: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  resultHighlight: {
    color: colors.primary,
    fontWeight: "600",
  },
  body: {
    color: "rgba(226,232,240,0.85)",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  ctaRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  fullWidthCta: {
    alignSelf: "stretch",
  },
  error: {
    color: colors.destructive,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  code: {
    color: colors.primary,
    fontWeight: "700",
  },
  promptCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryDark,
  },
  promptLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: colors.primary,
    marginBottom: spacing.xs,
    fontWeight: "600",
  },
  promptBody: {
    fontSize: 16,
    color: colors.foreground,
    lineHeight: 22,
  },
  bioSpacing: {
    marginTop: spacing.md,
  },
  continueButton: {
    marginTop: spacing.lg,
    alignSelf: "stretch",
  },
});
