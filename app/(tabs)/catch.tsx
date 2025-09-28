import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { FursuitCard, CAUGHT_SUITS_QUERY_KEY } from '../../src/features/suits';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../src/components/ui/TailTagInput';
import { useAuth } from '../../src/features/auth';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing } from '../../src/theme';
import { normalizeUniqueCodeInput } from '../../src/utils/code';
import { toDisplayDateTime } from '../../src/utils/dates';

import type { FursuitsRow } from '../../src/types/database';

type FursuitDetails = Pick<
  FursuitsRow,
  'id' | 'name' | 'species' | 'avatar_url' | 'unique_code' | 'owner_id'
> & { created_at: string | null };

type CatchRecord = {
  id: string;
  caught_at: string | null;
};

export default function CatchScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();

  const [codeInput, setCodeInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [caughtFursuit, setCaughtFursuit] = useState<FursuitDetails | null>(null);
  const [catchRecord, setCatchRecord] = useState<CatchRecord | null>(null);

  const handleSubmit = async () => {
    if (!userId || isSubmitting) {
      return;
    }

    const normalizedCode = normalizeUniqueCodeInput(codeInput);

    if (!normalizedCode) {
      setSubmitError('Enter the code from the fursuit badge to record your catch.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const client = supabase as any;

      const { data: fursuit, error: fursuitError } = await client
        .from('fursuits')
        .select('id, name, species, avatar_url, unique_code, owner_id, created_at')
        .eq('unique_code', normalizedCode)
        .maybeSingle();

      if (fursuitError) {
        throw fursuitError;
      }

      if (!fursuit) {
        setCaughtFursuit(null);
        setCatchRecord(null);
        setSubmitError("We couldn't find a fursuit with that code. Double-check the letters and try again.");
        return;
      }

      if (fursuit.owner_id === userId) {
        setCaughtFursuit(null);
        setCatchRecord(null);
        setSubmitError(
          "That tag belongs to one of your own suits. Trade codes with friends to grow your collection."
        );
        return;
      }

      const { data: suitConventionRows, error: suitConventionError } = await client
        .from('fursuit_conventions')
        .select('convention_id')
        .eq('fursuit_id', fursuit.id);

      if (suitConventionError) {
        throw suitConventionError;
      }

      const { data: playerConventionRows, error: playerConventionError } = await client
        .from('profile_conventions')
        .select('convention_id')
        .eq('profile_id', userId);

      if (playerConventionError) {
        throw playerConventionError;
      }

      const suitConventionIds = new Set(
        (suitConventionRows ?? []).map((row: { convention_id: string }) => row.convention_id)
      );
      const playerConventionIds = new Set(
        (playerConventionRows ?? []).map((row: { convention_id: string }) => row.convention_id)
      );

      if (playerConventionIds.size === 0) {
        setCaughtFursuit(null);
        setCatchRecord(null);
        setSubmitError('Opt into at least one convention in Settings before logging catches.');
        return;
      }

      if (suitConventionIds.size === 0) {
        setCaughtFursuit(null);
        setCatchRecord(null);
        setSubmitError(
          'This suit has not opted into any conventions yet. Ask the owner to update their settings before logging the catch.'
        );
        return;
      }

      const sharedConventions = [...playerConventionIds].filter((id) => suitConventionIds.has(id));

      if (sharedConventions.length === 0) {
        setCaughtFursuit(null);
        setCatchRecord(null);
        setSubmitError(
          'You and this suit need to opt into the same convention before logging the catch.'
        );
        return;
      }

      const { data: existingCatch, error: existingCatchError } = await client
        .from('catches')
        .select('id')
        .eq('fursuit_id', fursuit.id)
        .eq('catcher_id', userId)
        .maybeSingle();

      if (existingCatchError) {
        throw existingCatchError;
      }

      if (existingCatch) {
        setCaughtFursuit(null);
        setCatchRecord(null);
        setSubmitError(
          'You already caught this suit. Swap codes with another fursuiter to keep hunting.'
        );
        return;
      }

      const { data: insertedCatch, error: catchError } = await client
        .from('catches')
        .insert({ fursuit_id: fursuit.id })
        .select('id, caught_at')
        .single();

      if (catchError) {
        if (catchError.code === '23505') {
          setSubmitError(
            'You already caught this suit. Swap codes with another fursuiter to keep hunting.'
          );
          setCaughtFursuit(null);
          setCatchRecord(null);
          return;
        }

        throw catchError;
      }

      setCaughtFursuit(fursuit);
      setCatchRecord(insertedCatch ?? null);
      queryClient.invalidateQueries({ queryKey: [CAUGHT_SUITS_QUERY_KEY, userId] });
      setCodeInput('');
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : "We couldn't save that catch. Please try again.";
      setSubmitError(fallbackMessage);
      setCaughtFursuit(null);
      setCatchRecord(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const caughtAtLabel = catchRecord
    ? toDisplayDateTime(catchRecord.caught_at) ?? 'Caught just now'
    : null;

  const handleCatchAnother = () => {
    setCaughtFursuit(null);
    setCatchRecord(null);
    setSubmitError(null);
    setCodeInput('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Tag and trade</Text>
          <Text style={styles.title}>Log a new catch</Text>
          <Text style={styles.subtitle}>
            Enter the eight-letter code from a friend&apos;s tail tag to add them to your collection.
          </Text>
        </View>

        <TailTagCard style={styles.cardSpacing}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Catch code</Text>
            <TailTagInput
              value={codeInput}
              onChangeText={(value) => {
                setCodeInput(normalizeUniqueCodeInput(value));
                setSubmitError(null);
              }}
              placeholder="ABCDEFGH"
              autoCapitalize="characters"
              editable={!isSubmitting}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              style={styles.codeInput}
            />
            <Text style={styles.helpText}>Letters only, up to 8 characters.</Text>
          </View>

          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

          <TailTagButton
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={!userId || isSubmitting}
          >
            Record catch
          </TailTagButton>
        </TailTagCard>

        {caughtFursuit ? (
          <TailTagCard style={styles.cardSpacing}>
            <Text style={styles.sectionTitle}>Nice catch!</Text>
            <Text style={styles.sectionBody}>
              You just tagged {caughtFursuit.name}. Trade codes to keep your streak growing.
            </Text>
            <FursuitCard
              name={caughtFursuit.name}
              species={caughtFursuit.species}
              avatarUrl={caughtFursuit.avatar_url}
              uniqueCode={caughtFursuit.unique_code}
              timelineLabel={caughtAtLabel ?? undefined}
            />
            <View style={styles.buttonRow}>
              <TailTagButton
                variant="outline"
                onPress={() => router.push('/caught')}
                style={styles.inlineButtonSpacing}
              >
                View catches
              </TailTagButton>
              <TailTagButton variant="ghost" onPress={handleCatchAnother}>
                Catch another suit
              </TailTagButton>
            </View>
          </TailTagCard>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.lg,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 15,
  },
  cardSpacing: {
    marginBottom: spacing.lg,
  },
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  helpText: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
    marginTop: spacing.xs,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  sectionBody: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
    marginBottom: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    alignItems: 'center',
  },
  inlineButtonSpacing: {
    marginRight: spacing.md,
  },
  codeInput: {
    textTransform: 'uppercase',
    letterSpacing: 4,
    fontSize: 20,
  },
});
