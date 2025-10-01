import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  FursuitCard,
  FursuitBioDetails,
  CAUGHT_SUITS_QUERY_KEY,
  CAUGHT_SUITS_STALE_TIME,
  fetchCaughtSuits,
} from '../../src/features/suits';
import type { CaughtRecord } from '../../src/features/suits';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../src/components/ui/TailTagInput';
import { useAuth } from '../../src/features/auth';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing } from '../../src/theme';
import { toDisplayDateTime } from '../../src/utils/dates';

const getAskPromptText = (askMeAbout: string | null | undefined) => {
  const trimmed = (askMeAbout ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'Ask them anything that catches your eye!';
};

export default function CaughtSuitsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const router = useRouter();
  const caughtSuitsKey = useMemo(() => [CAUGHT_SUITS_QUERY_KEY, userId] as const, [userId]);

  const queryClient = useQueryClient();
  const [editingCatchId, setEditingCatchId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const {
    data: records = [],
    error,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<CaughtRecord[], Error>({
    queryKey: caughtSuitsKey,
    enabled: Boolean(userId),
    staleTime: CAUGHT_SUITS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchCaughtSuits(userId!),
  });

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        return;
      }

      const state = queryClient.getQueryState<CaughtRecord[]>(caughtSuitsKey);

      if (
        !state ||
        state.isInvalidated ||
        (state.status === 'success' && Date.now() - state.dataUpdatedAt > CAUGHT_SUITS_STALE_TIME)
      ) {
        void refetch({ throwOnError: false });
      }
    }, [caughtSuitsKey, queryClient, refetch, userId])
  );

  const handleRefresh = useCallback(async () => {
    await refetch({ throwOnError: false });
  }, [refetch]);

  const handleStartEditing = useCallback(
    (recordId: string, initialValue: string | null) => {
      if (isSavingNote) {
        return;
      }

      setEditingCatchId(recordId);
      setNoteDraft(initialValue ?? '');
      setNoteError(null);
    },
    [isSavingNote]
  );

  const handleCancelEditing = useCallback(() => {
    if (isSavingNote) {
      return;
    }

    setEditingCatchId(null);
    setNoteDraft('');
    setNoteError(null);
  }, [isSavingNote]);

  const handleSaveNote = useCallback(async () => {
    if (!editingCatchId || !userId || isSavingNote) {
      return;
    }

    const client = supabase as any;
    const trimmedNote = noteDraft.trim();
    const payload = trimmedNote.length > 0 ? trimmedNote : null;

    setIsSavingNote(true);
    setNoteError(null);

    try {
      const { data, error } = await client
        .from('catches')
        .update({ conversation_note: payload })
        .eq('id', editingCatchId)
        .select('id, conversation_note')
        .single();

      if (error) {
        throw error;
      }

      queryClient.setQueryData<CaughtRecord[] | undefined>(caughtSuitsKey, (existing) => {
        if (!existing) {
          return existing;
        }

        return existing.map((item) =>
          item.id === editingCatchId
            ? { ...item, conversation_note: data?.conversation_note ?? null }
            : item
        );
      });

      setEditingCatchId(null);
      setNoteDraft('');
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : "We couldn't save your note right now. Please try again.";
      setNoteError(fallbackMessage);
    } finally {
      setIsSavingNote(false);
    }
  }, [caughtSuitsKey, editingCatchId, isSavingNote, noteDraft, queryClient, userId]);

  const hasRecords = records.length > 0;
  const errorMessage = error?.message ?? null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Caught suits</Text>
        <Text style={styles.title}>Your collection</Text>
        <Text style={styles.subtitle}>
          Every tag you log shows up here. Keep hunting to grow your streak.
        </Text>
      </View>

      <TailTagCard>
        {isLoading ? (
          <Text style={styles.message}>Loading your catches…</Text>
        ) : errorMessage ? (
          <View style={styles.helper}>
            <Text style={styles.error}>{errorMessage}</Text>
            <TailTagButton variant="outline" size="sm" onPress={handleRefresh}>
              Try again
            </TailTagButton>
          </View>
        ) : hasRecords ? (
          <View style={styles.list}>
            {records.map((record, index) => {
              const details = record.fursuit;

              if (!details) {
                return null;
              }

              const label = toDisplayDateTime(record.caught_at) ?? 'Caught just now';
              const isEditing = editingCatchId === record.id;
              const note = record.conversation_note ?? null;
              const shouldShowError = isEditing && noteError;

              return (
                <View
                  key={record.id}
                  style={index < records.length - 1 ? styles.listItemSpacing : undefined}
                >
                  <FursuitCard
                    name={details.name}
                    species={details.species}
                    avatarUrl={details.avatar_url}
                    uniqueCode={details.unique_code}
                    timelineLabel={label}
                    codeLabel={undefined}
                    onPress={() => router.push({ pathname: '/fursuits/[id]', params: { id: details.id } })}
                  />
                  {details.bio ? (
                    <View style={styles.bioSpacing}>
                      <FursuitBioDetails bio={details.bio} />
                    </View>
                  ) : null}
                  {details.bio ? (
                    <View style={styles.askCallout}>
                      <Text style={styles.askCalloutTitle}>Ask this suiter</Text>
                      <Text style={styles.askCalloutBody}>
                        {getAskPromptText(details.bio.askMeAbout)}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.noteContainer}>
                    <Text style={styles.noteLabel}>Conversation notes</Text>
                    {isEditing ? (
                      <>
                        <TailTagInput
                          multiline
                          textAlignVertical="top"
                          style={styles.noteInput}
                          value={noteDraft}
                          onChangeText={(value) => {
                            setNoteDraft(value);
                            setNoteError(null);
                          }}
                          editable={!isSavingNote}
                          placeholder="Shared pronouns, mutual friends, fun facts…"
                        />
                        {shouldShowError ? (
                          <Text style={styles.noteError}>{noteError ?? ''}</Text>
                        ) : null}
                        <View style={styles.noteActions}>
                          <TailTagButton
                            size="sm"
                            onPress={handleSaveNote}
                            loading={isSavingNote}
                            disabled={isSavingNote}
                          >
                            Save note
                          </TailTagButton>
                          <TailTagButton
                            size="sm"
                            variant="ghost"
                            onPress={handleCancelEditing}
                            disabled={isSavingNote}
                          >
                            Cancel
                          </TailTagButton>
                        </View>
                      </>
                    ) : (
                      <>
                        {note ? (
                          <Text style={styles.noteText}>{note}</Text>
                        ) : (
                          <Text style={styles.notePlaceholder}>
                            Add a quick note so you remember this catch later.
                          </Text>
                        )}
                        <TailTagButton
                          size="sm"
                          variant="ghost"
                          style={styles.noteActionButton}
                          onPress={() => handleStartEditing(record.id, note)}
                        >
                          {note ? 'Edit note' : 'Add note'}
                        </TailTagButton>
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.message}>
            You haven&apos;t caught any suits yet. Tap “Catch” to log a fresh tag.
          </Text>
        )}
      </TailTagCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(203,213,225,0.9)',
  },
  message: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  helper: {
    gap: spacing.sm,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
  list: {
    marginTop: spacing.md,
  },
  listItemSpacing: {
    marginBottom: spacing.md,
  },
  bioSpacing: {
    marginTop: spacing.sm,
  },
  askCallout: {
    marginTop: spacing.md,
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
  noteContainer: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  noteLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  noteInput: {
    minHeight: 100,
  },
  noteText: {
    color: 'rgba(203,213,225,0.95)',
    fontSize: 14,
  },
  notePlaceholder: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 14,
  },
  noteActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  noteActionButton: {
    alignSelf: 'flex-start',
  },
  noteError: {
    color: '#fca5a5',
    fontSize: 13,
  },
});
