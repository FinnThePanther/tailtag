import { useEffect, useMemo, useState } from 'react';
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

import {
  FursuitCard,
  FursuitBioDetails,
  CAUGHT_SUITS_QUERY_KEY,
  mapLatestFursuitBio,
} from '../../src/features/suits';
import type { FursuitBio } from '../../src/features/suits';
import {
  CONVENTION_LEADERBOARD_QUERY_KEY,
  CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
} from '../../src/features/leaderboard';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../src/components/ui/TailTagInput';
import { useAuth } from '../../src/features/auth';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing } from '../../src/theme';
import { normalizeUniqueCodeInput } from '../../src/utils/code';
import { toDisplayDateTime } from '../../src/utils/dates';

import type { FursuitsRow } from '../../src/types/database';
import type { CaughtRecord as CaughtSuitsRecord } from '../../src/features/suits';

type FursuitDetails = Pick<
  FursuitsRow,
  'id' | 'name' | 'species' | 'species_id' | 'avatar_url' | 'unique_code' | 'owner_id'
> & { created_at: string | null; bio: FursuitBio | null };

type CatchRecord = {
  id: string;
  caught_at: string | null;
  conversation_note: string | null;
};

const getAskPromptText = (askMeAbout: string | null | undefined) => {
  const trimmed = (askMeAbout ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'Ask them anything that catches your eye!';
};

export default function CatchScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const caughtSuitsKey = useMemo(() => [CAUGHT_SUITS_QUERY_KEY, userId] as const, [userId]);

  const [codeInput, setCodeInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [caughtFursuit, setCaughtFursuit] = useState<FursuitDetails | null>(null);
  const [catchRecord, setCatchRecord] = useState<CatchRecord | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    if (catchRecord) {
      setNoteInput(catchRecord.conversation_note ?? '');
      setNoteError(null);
      setNoteSaved(Boolean(catchRecord.conversation_note));
    } else {
      setNoteInput('');
      setNoteError(null);
      setNoteSaved(false);
    }
  }, [catchRecord]);

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
        .select(
          `
          id,
          name,
          species,
          species_id,
          avatar_url,
          unique_code,
          owner_id,
          created_at,
          species_entry:fursuit_species (
            id,
            name,
            normalized_name
          ),
          fursuit_bios (
            version,
            fursuit_name,
            fursuit_species,
            owner_name,
            pronouns,
            tagline,
            fun_fact,
            likes_and_interests,
            ask_me_about,
            social_links,
            created_at,
            updated_at
          )
        `
        )
        .eq('unique_code', normalizedCode)
        .order('version', { ascending: false, foreignTable: 'fursuit_bios' })
        .limit(1, { foreignTable: 'fursuit_bios' })
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

      const normalizedFursuit: FursuitDetails = {
        id: fursuit.id,
        name: fursuit.name,
        species: (fursuit as any)?.species_entry?.name ?? fursuit.species ?? null,
        species_id: (fursuit as any)?.species_entry?.id ?? fursuit.species_id ?? null,
        avatar_url: fursuit.avatar_url ?? null,
        unique_code: fursuit.unique_code ?? null,
        owner_id: fursuit.owner_id,
        created_at: fursuit.created_at ?? null,
        bio: mapLatestFursuitBio((fursuit as any)?.fursuit_bios ?? null),
      };

      if (normalizedFursuit.owner_id === userId) {
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
        .eq('fursuit_id', normalizedFursuit.id);

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
        .eq('fursuit_id', normalizedFursuit.id)
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
        .insert({ fursuit_id: normalizedFursuit.id })
        .select('id, caught_at, conversation_note')
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

      setCaughtFursuit(normalizedFursuit);
      setCatchRecord(insertedCatch ?? null);
      sharedConventions.forEach((conventionId) => {
        queryClient.invalidateQueries({
          queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId],
        });
        queryClient.invalidateQueries({
          queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, conventionId],
        });
      });
      queryClient.invalidateQueries({ queryKey: caughtSuitsKey });
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
    setNoteInput('');
    setNoteError(null);
    setNoteSaved(false);
  };

  const handleSaveNote = async () => {
    if (!catchRecord?.id || !userId || isSavingNote) {
      return;
    }

    const client = supabase as any;
    const trimmedNote = noteInput.trim();
    const payload = trimmedNote.length > 0 ? trimmedNote : null;

    setIsSavingNote(true);
    setNoteError(null);

    try {
      const { data, error } = await client
        .from('catches')
        .update({ conversation_note: payload })
        .eq('id', catchRecord.id)
        .select('id, conversation_note, caught_at')
        .single();

      if (error) {
        throw error;
      }

      setCatchRecord((current) =>
        current
          ? {
              ...current,
              conversation_note: data?.conversation_note ?? null,
            }
          : current
      );
      setNoteInput(data?.conversation_note ?? '');
      setNoteSaved(Boolean(data?.conversation_note));

      queryClient.setQueryData<CaughtSuitsRecord[] | undefined>(caughtSuitsKey, (existing) => {
        if (!existing) {
          return existing;
        }

        return existing.map((item) =>
          item.id === catchRecord.id
            ? { ...item, conversation_note: data?.conversation_note ?? null }
            : item
        );
      });
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : "We couldn't save your note right now. Please try again.";
      setNoteError(fallbackMessage);
      setNoteSaved(false);
    } finally {
      setIsSavingNote(false);
    }
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
              You just tagged {caughtFursuit.name}. Scroll through their bio below and trade
              codes to keep your streak growing.
            </Text>
            <FursuitCard
              name={caughtFursuit.name}
              species={caughtFursuit.species}
              avatarUrl={caughtFursuit.avatar_url}
              uniqueCode={caughtFursuit.unique_code}
              timelineLabel={caughtAtLabel ?? undefined}
              onPress={() => router.push({ pathname: '/fursuits/[id]', params: { id: caughtFursuit.id } })}
            />
            {caughtFursuit.bio ? (
              <View style={styles.bioSpacing}>
                <FursuitBioDetails bio={caughtFursuit.bio} />
              </View>
            ) : null}
            {caughtFursuit.bio ? (
              <View style={styles.askCallout}>
                <Text style={styles.askCalloutTitle}>Ask this suiter</Text>
                <Text style={styles.askCalloutBody}>
                  {getAskPromptText(caughtFursuit.bio.askMeAbout)}
                </Text>
              </View>
            ) : null}
            <View style={styles.noteSection}>
              <Text style={styles.noteLabel}>Conversation notes</Text>
              <Text style={styles.noteHelp}>
                Jot down what you talked about so you remember this moment later.
              </Text>
              <TailTagInput
                multiline
                textAlignVertical="top"
                style={styles.noteInput}
                value={noteInput}
                onChangeText={(value) => {
                  setNoteInput(value);
                  setNoteSaved(false);
                  setNoteError(null);
                }}
                editable={!isSavingNote}
                placeholder="Shared pronouns, mutual friends, fun facts…"
                returnKeyType="default"
              />
              {noteError ? <Text style={styles.errorText}>{noteError}</Text> : null}
              {noteSaved && !noteError ? (
                <Text style={styles.noteStatus}>Note saved</Text>
              ) : null}
              <TailTagButton
                onPress={handleSaveNote}
                loading={isSavingNote}
                disabled={!userId || isSavingNote}
                size="sm"
                style={styles.noteButton}
              >
                Save note
              </TailTagButton>
            </View>
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
  bioSpacing: {
    marginTop: spacing.md,
  },
  askCallout: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 20,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    gap: spacing.xs,
  },
  askCalloutTitle: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  askCalloutBody: {
    color: 'rgba(203,213,225,0.95)',
    fontSize: 14,
    lineHeight: 20,
  },
  noteSection: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  noteLabel: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  noteHelp: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
  },
  noteInput: {
    minHeight: 120,
  },
  noteStatus: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
  },
  noteButton: {
    alignSelf: 'flex-start',
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
