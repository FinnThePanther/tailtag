import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { TailTagCard } from '../../../src/components/ui/TailTagCard';
import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import { TailTagInput } from '../../../src/components/ui/TailTagInput';
import {
  CAUGHT_SUITS_QUERY_KEY,
  FursuitBio,
  fetchFursuitDetail,
  fursuitDetailQueryKey,
  MY_SUITS_QUERY_KEY,
} from '../../../src/features/suits';
import type { EditableSocialLink } from '../../../src/features/suits/forms/socialLinks';
import {
  SOCIAL_LINK_LIMIT,
  createEmptySocialLink,
  mapEditableSocialLinks,
} from '../../../src/features/suits/forms/socialLinks';
import {
  addFursuitConvention,
  CONVENTIONS_STALE_TIME,
  createConventionsQueryOptions,
  fetchProfileConventionIds,
  PROFILE_CONVENTIONS_QUERY_KEY,
  removeFursuitConvention,
} from '../../../src/features/conventions';
import { ConventionToggle } from '../../../src/components/conventions/ConventionToggle';
import {
  ensureSpeciesEntry,
  fetchFursuitSpecies,
  FURSUIT_SPECIES_QUERY_KEY,
  normalizeSpeciesName,
  sortSpeciesOptions,
  type FursuitSpeciesOption,
} from '../../../src/features/species';
import { useAuth } from '../../../src/features/auth';
import { supabase } from '../../../src/lib/supabase';
import { colors, spacing } from '../../../src/theme';
import type { Json } from '../../../src/types/database';

const normalizeLinksForSave = (links: EditableSocialLink[]) =>
  links
    .map((entry) => ({
      label: entry.label.trim(),
      url: entry.url.trim(),
    }))
    .filter((entry) => entry.label.length > 0 || entry.url.length > 0);

const enforceUrlProtocol = (value: string) => /^https?:\/\//i.test(value);

export default function EditFursuitScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const fursuitId = typeof params.id === 'string' ? params.id : null;

  const {
    data: speciesOptions = [],
    error: speciesError,
    isLoading: isSpeciesLoading,
    refetch: refetchSpecies,
  } = useQuery<FursuitSpeciesOption[], Error>({
    queryKey: [FURSUIT_SPECIES_QUERY_KEY],
    queryFn: fetchFursuitSpecies,
    staleTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const {
    data: detail,
    isLoading,
    error,
    refetch,
  } = useQuery({
    enabled: Boolean(fursuitId),
    queryKey: fursuitDetailQueryKey(fursuitId ?? ''),
    queryFn: () => fetchFursuitDetail(fursuitId ?? ''),
    staleTime: 0,
  });

  const conventionsQueryOptions = useMemo(() => createConventionsQueryOptions(), []);
  const {
    data: conventions = [],
    error: conventionsError,
    isLoading: isConventionsLoading,
    refetch: refetchConventions,
  } = useQuery({
    ...conventionsQueryOptions,
    enabled: Boolean(userId),
  });

  const {
    data: profileConventionIds = [],
    error: profileConventionsError,
    isLoading: isProfileConventionsLoading,
    refetch: refetchProfileConventions,
  } = useQuery<string[], Error>({
    queryKey: [PROFILE_CONVENTIONS_QUERY_KEY, userId],
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchProfileConventionIds(userId!),
  });

  const [selectedConventionIds, setSelectedConventionIds] = useState<Set<string>>(new Set());
  const [initialConventionIds, setInitialConventionIds] = useState<Set<string>>(new Set());

  const profileConventionIdSet = useMemo(
    () => new Set(profileConventionIds),
    [profileConventionIds]
  );

  const isConventionsBusy = isConventionsLoading || isProfileConventionsLoading;
  const conventionsLoadError = conventionsError?.message ?? profileConventionsError?.message ?? null;

  const [hasHydratedForm, setHasHydratedForm] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [speciesInput, setSpeciesInput] = useState('');
  const [ownerNameInput, setOwnerNameInput] = useState('');
  const [pronounsInput, setPronounsInput] = useState('');
  const [taglineInput, setTaglineInput] = useState('');
  const [funFactInput, setFunFactInput] = useState('');
  const [likesInput, setLikesInput] = useState('');
  const [askMeAboutInput, setAskMeAboutInput] = useState('');
  const [socialLinks, setSocialLinks] = useState<EditableSocialLink[]>([createEmptySocialLink()]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<FursuitSpeciesOption | null>(null);

  const speciesLoadError = speciesError?.message ?? null;
  const isSpeciesBusy = isSpeciesLoading;

  const normalizedSpeciesInput = useMemo(
    () => normalizeSpeciesName(speciesInput),
    [speciesInput]
  );

  const speciesSuggestions = useMemo(() => {
    if (speciesOptions.length === 0) {
      return [] as FursuitSpeciesOption[];
    }

    if (!normalizedSpeciesInput) {
      return speciesOptions.slice(0, 12);
    }

    return speciesOptions
      .filter((option) => option.normalizedName.includes(normalizedSpeciesInput))
      .slice(0, 12);
  }, [normalizedSpeciesInput, speciesOptions]);

  const handleSpeciesInputChange = useCallback(
    (value: string) => {
      setSpeciesInput(value);

      const normalized = normalizeSpeciesName(value);

      if (!normalized) {
        setSelectedSpecies(null);
        return;
      }

      const match = speciesOptions.find((option) => option.normalizedName === normalized) ?? null;
      setSelectedSpecies(match);
    },
    [speciesOptions]
  );

  const handleSpeciesSelect = useCallback((option: FursuitSpeciesOption) => {
    setSpeciesInput(option.name);
    setSelectedSpecies(option);
  }, []);

  useEffect(() => {
    if (!detail || hasHydratedForm) {
      return;
    }

    setNameInput(detail.name ?? '');
    setSpeciesInput(detail.species ?? '');

    if (detail.species && detail.speciesId) {
      setSelectedSpecies({
        id: detail.speciesId,
        name: detail.species,
        normalizedName: normalizeSpeciesName(detail.species),
      });
    } else {
      setSelectedSpecies(null);
    }

    const bio: FursuitBio | null = detail.bio;

    setOwnerNameInput(bio?.ownerName ?? '');
    setPronounsInput(bio?.pronouns ?? '');
    setTaglineInput(bio?.tagline ?? '');
    setFunFactInput(bio?.funFact ?? '');
    setLikesInput(bio?.likesAndInterests ?? '');
    setAskMeAboutInput(bio?.askMeAbout ?? '');

    const existingLinks = bio?.socialLinks ?? [];

    if (existingLinks.length > 0) {
      setSocialLinks(
        mapEditableSocialLinks(
          existingLinks.map((entry) => ({ label: entry.label, url: entry.url }))
        )
      );
    } else {
      setSocialLinks([createEmptySocialLink()]);
    }

    const initialConventionSet = new Set((detail.conventions ?? []).map((entry) => entry.id));
    setSelectedConventionIds(new Set(initialConventionSet));
    setInitialConventionIds(initialConventionSet);

    setHasHydratedForm(true);
  }, [detail, hasHydratedForm]);

  const isOwner = useMemo(() => {
    if (!detail || !userId) {
      return false;
    }

    return detail.owner_id === userId;
  }, [detail, userId]);

  const socialLinksCanAddMore = useMemo(
    () => socialLinks.length < SOCIAL_LINK_LIMIT,
    [socialLinks.length]
  );

  const handleSocialLinkChange = (id: string, field: 'label' | 'url', value: string) => {
    setSocialLinks((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry))
    );
  };

  const handleAddSocialLink = () => {
    if (!socialLinksCanAddMore) {
      return;
    }

    setSocialLinks((current) => [...current, createEmptySocialLink()]);
  };

  const handleRemoveSocialLink = (id: string) => {
    setSocialLinks((current) => {
      const next = current.filter((entry) => entry.id !== id);
      return next.length > 0 ? next : [createEmptySocialLink()];
    });
  };

  const handleCancel = () => {
    router.back();
  };

  const handleSubmit = async () => {
    if (!detail || !fursuitId || !userId || isSubmitting) {
      return;
    }

    const trimmedName = nameInput.trim();
    const trimmedSpecies = speciesInput.trim();
    const trimmedOwnerName = ownerNameInput.trim();
    const trimmedPronouns = pronounsInput.trim();
    const trimmedTagline = taglineInput.trim();
    const trimmedFunFact = funFactInput.trim();
    const trimmedLikes = likesInput.trim();
    const trimmedAskMeAbout = askMeAboutInput.trim();
    const normalizedSpeciesValue = normalizeSpeciesName(trimmedSpecies);

    const normalizedSocialLinks = normalizeLinksForSave(socialLinks);

    if (!trimmedName) {
      setSubmitError('Give your fursuit a name before saving.');
      return;
    }

    if (!trimmedSpecies) {
      setSubmitError('Add your fursuit species before saving.');
      return;
    }

    if (!trimmedOwnerName) {
      setSubmitError('Add the owner name so players know who to talk to.');
      return;
    }

    if (!trimmedPronouns) {
      setSubmitError('Share pronouns so catchers can address you correctly.');
      return;
    }

    if (!trimmedTagline) {
      setSubmitError('Add a quick tagline to introduce your suit.');
      return;
    }

    if (!trimmedFunFact) {
      setSubmitError('Share a fun fact to make your bio memorable.');
      return;
    }

    if (!trimmedLikes) {
      setSubmitError('Tell players what you like or are interested in.');
      return;
    }

    if (!trimmedAskMeAbout) {
      setSubmitError('Give players a prompt so they know what to ask you.');
      return;
    }

    for (const entry of normalizedSocialLinks) {
      if (!entry.label || !entry.url) {
        setSubmitError('Fill in both the label and URL for each social link.');
        return;
      }

      if (!enforceUrlProtocol(entry.url)) {
        setSubmitError('Links should include http:// or https:// so we can open them.');
        return;
      }
    }

    const toAdd = Array.from(selectedConventionIds).filter(
      (id) => !initialConventionIds.has(id) && profileConventionIdSet.has(id)
    );
    const toRemove = Array.from(initialConventionIds).filter((id) => !selectedConventionIds.has(id));

    setIsSubmitting(true);
    setSubmitError(null);

    const client = supabase as any;
    const previousName = detail.name;
    const previousSpecies = detail.species;
    const previousSpeciesId = detail.speciesId ?? null;
    let updatedCoreRecord = false;
    const addedConventionIds: string[] = [];
    const removedConventionIds: string[] = [];

    try {
      const speciesRecord =
        selectedSpecies && selectedSpecies.normalizedName === normalizedSpeciesValue
          ? selectedSpecies
          : await ensureSpeciesEntry(trimmedSpecies);

      setSelectedSpecies(speciesRecord);
      setSpeciesInput(speciesRecord.name);
      queryClient.setQueryData<FursuitSpeciesOption[]>(
        [FURSUIT_SPECIES_QUERY_KEY],
        (current = []) => {
          const existingIndex = current.findIndex((option) => option.id === speciesRecord.id);

          if (existingIndex >= 0) {
            const next = [...current];
            next[existingIndex] = speciesRecord;
            return sortSpeciesOptions(next);
          }

          return sortSpeciesOptions([...current, speciesRecord]);
        }
      );
      void queryClient.invalidateQueries({ queryKey: [FURSUIT_SPECIES_QUERY_KEY] });

      const { error: updateError } = await client
        .from('fursuits')
        .update({
          name: trimmedName,
          species: speciesRecord.name,
          species_id: speciesRecord.id,
        })
        .eq('id', fursuitId)
        .eq('owner_id', userId);

      if (updateError) {
        throw updateError;
      }

      updatedCoreRecord = true;

      const nextVersion = (detail.bio?.version ?? 0) + 1;

      const { error: bioError } = await client.from('fursuit_bios').insert({
        fursuit_id: fursuitId,
        version: nextVersion,
        fursuit_name: trimmedName,
        fursuit_species: speciesRecord.name,
        owner_name: trimmedOwnerName,
        pronouns: trimmedPronouns,
        tagline: trimmedTagline,
        fun_fact: trimmedFunFact,
        likes_and_interests: trimmedLikes,
        ask_me_about: trimmedAskMeAbout,
        social_links: normalizedSocialLinks as unknown as Json,
      });

      if (bioError) {
        throw bioError;
      }

      for (const conventionId of toAdd) {
        await addFursuitConvention(fursuitId, conventionId);
        addedConventionIds.push(conventionId);
      }

      for (const conventionId of toRemove) {
        await removeFursuitConvention(fursuitId, conventionId);
        removedConventionIds.push(conventionId);
      }

      queryClient.invalidateQueries({ queryKey: fursuitDetailQueryKey(fursuitId) });
      queryClient.invalidateQueries({ queryKey: [MY_SUITS_QUERY_KEY, userId] });
      queryClient.invalidateQueries({ queryKey: [CAUGHT_SUITS_QUERY_KEY, userId] });

      setInitialConventionIds(new Set(selectedConventionIds));

      router.back();
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : "We couldn't update that fursuit right now. Please try again.";
      setSubmitError(fallbackMessage);

      if (addedConventionIds.length > 0) {
        await Promise.all(
          addedConventionIds.map((conventionId) =>
            removeFursuitConvention(fursuitId, conventionId).catch((revertError) => {
              console.warn('Failed to revert convention assignment after error', revertError);
            })
          )
        );
      }

      if (removedConventionIds.length > 0) {
        await Promise.all(
          removedConventionIds.map((conventionId) =>
            addFursuitConvention(fursuitId, conventionId).catch((revertError) => {
              console.warn('Failed to restore convention assignment after error', revertError);
            })
          )
        );
      }

      if (updatedCoreRecord) {
        const { error: revertError } = await client
          .from('fursuits')
          .update({
            name: previousName,
            species: previousSpecies,
            species_id: previousSpeciesId,
          })
          .eq('id', fursuitId)
          .eq('owner_id', userId);

        if (revertError) {
          console.warn('Failed to revert fursuit record after edit error', revertError);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const disableForm = isLoading || !detail || !isOwner || isSubmitting;

  const handleConventionToggle = useCallback(
    (conventionId: string) => {
      if (disableForm || !profileConventionIdSet.has(conventionId)) {
        return;
      }

      setSelectedConventionIds((current) => {
        const next = new Set(current);

        if (next.has(conventionId)) {
          next.delete(conventionId);
        } else {
          next.add(conventionId);
        }

        return next;
      });
    },
    [disableForm, profileConventionIdSet]
  );

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Edit bio</Text>
          <Text style={styles.title}>Refresh your fursuit entry</Text>
          <Text style={styles.subtitle}>
            Update your tagline, fun facts, and social links so players know how to say hi.
          </Text>
        </View>

        <TailTagCard>
          {isLoading ? (
            <Text style={styles.message}>Loading your fursuit details…</Text>
          ) : error ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>{
                error instanceof Error ? error.message : 'We could not load that fursuit.'
              }</Text>
              <TailTagButton variant="outline" size="sm" onPress={() => refetch()}>
                Try again
              </TailTagButton>
            </View>
          ) : !isOwner ? (
            <Text style={styles.message}>
              You can only edit suits you own. Switch accounts and try again.
            </Text>
          ) : (
            <View style={styles.formStack}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Fursuit name</Text>
                <TailTagInput
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Eclipse the Sergal"
                  editable={!disableForm}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Species</Text>
                <TailTagInput
                  value={speciesInput}
                  onChangeText={handleSpeciesInputChange}
                  placeholder="Sergal, Dutch Angel Dragon, etc."
                  editable={!disableForm}
                  returnKeyType="next"
                  autoCapitalize="words"
                />
                <Text style={styles.helperLabel}>
                  Tap a suggestion or keep typing to add a new species to the shared list.
                </Text>
                {isSpeciesBusy ? (
                  <Text style={styles.helperLabel}>Loading species…</Text>
                ) : speciesLoadError ? (
                  <View style={styles.helperColumn}>
                    <Text style={styles.errorText}>{speciesLoadError}</Text>
                    <TailTagButton
                      variant="outline"
                      size="sm"
                      onPress={() => {
                        void refetchSpecies({ throwOnError: false });
                      }}
                      disabled={disableForm}
                    >
                      Try again
                    </TailTagButton>
                  </View>
                ) : speciesSuggestions.length > 0 ? (
                  <View style={styles.speciesSuggestionSection}>
                    <Text style={styles.helperLabel}>
                      {normalizedSpeciesInput ? 'Matching species' : 'Popular species'}
                    </Text>
                    <View style={styles.speciesSuggestionList}>
                      {speciesSuggestions.map((option) => {
                        const isSelected = selectedSpecies?.id === option.id;
                        return (
                          <TailTagButton
                            key={option.id}
                            variant={isSelected ? 'primary' : 'ghost'}
                            size="sm"
                            onPress={() => handleSpeciesSelect(option)}
                            disabled={disableForm}
                            style={styles.speciesChip}
                          >
                            {option.name}
                          </TailTagButton>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Owner name</Text>
                <TailTagInput
                  value={ownerNameInput}
                  onChangeText={setOwnerNameInput}
                  placeholder="Who's inside the suit?"
                  editable={!disableForm}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Pronouns</Text>
                <TailTagInput
                  value={pronounsInput}
                  onChangeText={setPronounsInput}
                  placeholder="They/them, she/they, he/him, etc."
                  editable={!disableForm}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Tagline</Text>
                <TailTagInput
                  value={taglineInput}
                  onChangeText={setTaglineInput}
                  placeholder="One-liner that captures your vibe"
                  editable={!disableForm}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Fun fact</Text>
                <TailTagInput
                  value={funFactInput}
                  onChangeText={setFunFactInput}
                  placeholder="What should catchers remember about you?"
                  editable={!disableForm}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  style={styles.textArea}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Likes & interests</Text>
                <TailTagInput
                  value={likesInput}
                  onChangeText={setLikesInput}
                  placeholder="Games, hobbies, music - whatever makes you light up"
                  editable={!disableForm}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  style={styles.textArea}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Ask me about...</Text>
                <TailTagInput
                  value={askMeAboutInput}
                  onChangeText={setAskMeAboutInput}
                  placeholder="Give catchers a question to break the ice"
                  editable={!disableForm}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  style={styles.textArea}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Social links</Text>
                <Text style={styles.helperLabel}>
                  Add the places where catchers can follow you. Leave a row blank to skip it.
                </Text>
                <View style={styles.socialList}>
                  {socialLinks.map((entry, index) => (
                    <View key={entry.id} style={styles.socialRow}>
                      <TailTagInput
                        value={entry.label}
                        onChangeText={(value) => handleSocialLinkChange(entry.id, 'label', value)}
                        placeholder="Label (Twitter, Bluesky, Telegram, etc.)"
                        editable={!disableForm}
                        returnKeyType="next"
                        style={styles.socialInput}
                      />
                      <TailTagInput
                        value={entry.url}
                        onChangeText={(value) => handleSocialLinkChange(entry.id, 'url', value)}
                        placeholder="https://example.com/you"
                        editable={!disableForm}
                        autoCapitalize="none"
                        keyboardType="url"
                        returnKeyType={index === socialLinks.length - 1 ? 'done' : 'next'}
                        onSubmitEditing={index === socialLinks.length - 1 ? handleSubmit : undefined}
                        style={styles.socialInput}
                      />
                      <TailTagButton
                        variant="ghost"
                        size="sm"
                        onPress={() => handleRemoveSocialLink(entry.id)}
                        disabled={disableForm}
                        style={styles.socialRemoveButton}
                      >
                        Remove
                      </TailTagButton>
                    </View>
                  ))}
                </View>
                {socialLinksCanAddMore ? (
                  <TailTagButton
                    variant="outline"
                    size="sm"
                    onPress={handleAddSocialLink}
                    disabled={disableForm}
                  >
                    Add another link
                  </TailTagButton>
                ) : (
                  <Text style={styles.helperLabel}>You can add up to {SOCIAL_LINK_LIMIT} links.</Text>
                )}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Conventions</Text>
                <Text style={styles.helperLabel}>
                  Update where catchers can trade tags with this suit.
                </Text>
                {isConventionsBusy ? (
                  <Text style={styles.message}>Loading conventions…</Text>
                ) : conventionsLoadError ? (
                  <View style={styles.helperColumn}>
                    <Text style={styles.errorText}>{conventionsLoadError}</Text>
                    <TailTagButton
                      variant="outline"
                      size="sm"
                      onPress={() => {
                        void refetchConventions({ throwOnError: false });
                        void refetchProfileConventions({ throwOnError: false });
                      }}
                      disabled={disableForm}
                    >
                      Try again
                    </TailTagButton>
                  </View>
                ) : conventions.length === 0 ? (
                  <Text style={styles.message}>No conventions are available yet. Check back soon.</Text>
                ) : profileConventionIdSet.size === 0 ? (
                  <Text style={styles.message}>
                    Opt into a convention from Settings before assigning this suit.
                  </Text>
                ) : (
                  <View style={styles.conventionList}>
                    {conventions.map((convention) => {
                      const isAllowed = profileConventionIdSet.has(convention.id);
                      const isSelected = selectedConventionIds.has(convention.id);

                      return (
                        <ConventionToggle
                          key={convention.id}
                          convention={convention}
                          selected={isSelected}
                          pending={false}
                          disabled={disableForm || (!isAllowed && !isSelected)}
                          badgeText={
                            isAllowed
                              ? isSelected
                                ? 'Assigned'
                                : 'Tap to assign'
                              : 'Opt in via Settings'
                          }
                          onToggle={() => handleConventionToggle(convention.id)}
                        />
                      );
                    })}
                  </View>
                )}
              </View>

              {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

              <View style={styles.buttonRow}>
                <TailTagButton
                  variant="ghost"
                  onPress={handleCancel}
                  disabled={isSubmitting}
                  style={styles.inlineButtonSpacing}
                >
                  Cancel
                </TailTagButton>
                <TailTagButton onPress={handleSubmit} loading={isSubmitting} disabled={isSubmitting}>
                  Save changes
                </TailTagButton>
              </View>
            </View>
          )}
        </TailTagCard>
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
    color: 'rgba(203,213,225,0.9)',
    fontSize: 15,
  },
  formStack: {
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  textArea: {
    minHeight: 96,
  },
  helperLabel: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
  },
  helperColumn: {
    gap: spacing.sm,
  },
  speciesSuggestionSection: {
    gap: spacing.xs,
  },
  speciesSuggestionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  speciesChip: {
    minHeight: 36,
  },
  conventionList: {
    gap: spacing.sm,
  },
  socialList: {
    gap: spacing.sm,
  },
  socialRow: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  socialInput: {
    flex: 1,
  },
  socialRemoveButton: {
    alignSelf: 'flex-start',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  inlineButtonSpacing: {
    marginRight: spacing.md,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  message: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  errorBlock: {
    gap: spacing.sm,
  },
});
