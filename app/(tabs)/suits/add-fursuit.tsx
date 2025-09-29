import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../../src/components/ui/TailTagInput';
import { FURSUIT_BUCKET, MAX_IMAGE_SIZE } from '../../../src/constants/storage';
import { UNIQUE_CODE_ATTEMPTS, UNIQUE_INSERT_ATTEMPTS } from '../../../src/constants/codes';
import { useAuth } from '../../../src/features/auth';
import { supabase } from '../../../src/lib/supabase';
import { generateUniqueCodeCandidate } from '../../../src/utils/code';
import { loadUriAsUint8Array } from '../../../src/utils/files';
import { colors, spacing, radius } from '../../../src/theme';
import { MY_SUITS_QUERY_KEY } from '../../../src/features/suits';
import {
  ensureSpeciesEntry,
  fetchFursuitSpecies,
  FURSUIT_SPECIES_QUERY_KEY,
  normalizeSpeciesName,
  sortSpeciesOptions,
  type FursuitSpeciesOption,
} from '../../../src/features/species';
import {
  addFursuitConvention,
  CONVENTIONS_STALE_TIME,
  createConventionsQueryOptions,
  fetchProfileConventionIds,
  PROFILE_CONVENTIONS_QUERY_KEY,
} from '../../../src/features/conventions';
import { ConventionToggle } from '../../../src/components/conventions/ConventionToggle';

import type { FursuitBiosInsert, FursuitsInsert, Json } from '../../../src/types/database';
import {
  createEmptySocialLink,
  SOCIAL_LINK_LIMIT,
} from '../../../src/features/suits/forms/socialLinks';
import type { EditableSocialLink } from '../../../src/features/suits/forms/socialLinks';

type UploadCandidate = {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
} | null;

export default function AddFursuitScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();

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

  const [nameInput, setNameInput] = useState('');
  const [speciesInput, setSpeciesInput] = useState('');
  const [selectedSpecies, setSelectedSpecies] = useState<FursuitSpeciesOption | null>(null);
  const [ownerNameInput, setOwnerNameInput] = useState('');
  const [pronounsInput, setPronounsInput] = useState('');
  const [taglineInput, setTaglineInput] = useState('');
  const [funFactInput, setFunFactInput] = useState('');
  const [likesInput, setLikesInput] = useState('');
  const [askMeAboutInput, setAskMeAboutInput] = useState('');
  const [socialLinks, setSocialLinks] = useState<EditableSocialLink[]>([createEmptySocialLink()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [selectedPhoto, setSelectedPhoto] = useState<UploadCandidate>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

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
  const [hasHydratedConventions, setHasHydratedConventions] = useState(false);

  const socialLinksCanAddMore = useMemo(
    () => socialLinks.length < SOCIAL_LINK_LIMIT,
    [socialLinks.length]
  );

  const profileConventionIdSet = useMemo(
    () => new Set(profileConventionIds),
    [profileConventionIds]
  );

  useEffect(() => {
    if (!userId) {
      setSelectedConventionIds(new Set());
      setHasHydratedConventions(false);
      return;
    }

    if (!hasHydratedConventions) {
      setSelectedConventionIds(new Set(profileConventionIds));
      setHasHydratedConventions(true);
      return;
    }

    setSelectedConventionIds((current) => {
      const filtered = new Set([...current].filter((id) => profileConventionIdSet.has(id)));
      return filtered.size === current.size ? current : filtered;
    });
  }, [hasHydratedConventions, profileConventionIdSet, profileConventionIds, userId]);

  const isConventionsBusy = isConventionsLoading || isProfileConventionsLoading;
  const conventionsLoadError = conventionsError?.message ?? profileConventionsError?.message ?? null;

  const handleConventionToggle = useCallback(
    (conventionId: string) => {
      if (!profileConventionIdSet.has(conventionId)) {
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
    [profileConventionIdSet]
  );

  const ensureUniqueCode = useCallback(async () => {
    const client = supabase as any;

    for (let attempt = 0; attempt < UNIQUE_CODE_ATTEMPTS; attempt += 1) {
      const candidate = generateUniqueCodeCandidate();
      const { data, error } = await client
        .from('fursuits')
        .select('id')
        .eq('unique_code', candidate)
        .limit(1);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return candidate;
      }
    }

    throw new Error("We couldn't generate a unique tag code. Please try again.");
  }, []);

  const handlePickPhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        setPhotoError('We need media library access to select a photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset) {
        setPhotoError('No photo selected.');
        return;
      }

      if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE) {
        setPhotoError('Suit photos must be 5MB or smaller.');
        return;
      }

      const candidate: UploadCandidate = {
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: asset.fileName ?? `fursuit-${Date.now()}.jpg`,
        fileSize: asset.fileSize ?? 0,
      };

      setSelectedPhoto(candidate);
      setPhotoError(null);
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : 'We could not open your photo library. Please try again.';
      setPhotoError(fallbackMessage);
    }
  }, []);

  const handleClearPhoto = () => {
    setSelectedPhoto(null);
    setPhotoError(null);
  };

  const handleSubmit = async () => {
    if (!userId || isSubmitting) {
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
    const normalizedSocialLinks = socialLinks
      .map((entry) => ({
        label: entry.label.trim(),
        url: entry.url.trim(),
      }))
      .filter((entry) => entry.label.length > 0 || entry.url.length > 0);

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

      const hasValidProtocol = /^https?:\/\//i.test(entry.url);

      if (!hasValidProtocol) {
        setSubmitError('Links should include http:// or https:// so we can open them.');
        return;
      }
    }

    if (selectedPhoto && selectedPhoto.fileSize > MAX_IMAGE_SIZE) {
      setSubmitError('Suit photos must be 5MB or smaller.');
      return;
    }

    const allowedConventionIds = Array.from(selectedConventionIds).filter((id) =>
      profileConventionIdSet.has(id)
    );

    setIsSubmitting(true);
    setSubmitError(null);

    let uploadedStoragePath: string | null = null;
    let createdFursuitId: string | null = null;

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

      let avatarUrl: string | null = null;

      if (selectedPhoto) {
        const extension = selectedPhoto.fileName.split('.').pop()?.toLowerCase() ?? 'png';
        const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const storagePath = `${userId}/${uniqueSuffix}.${extension}`;
        uploadedStoragePath = storagePath;

        const fileBytes = await loadUriAsUint8Array(selectedPhoto.uri);

        const { error: uploadError } = await supabase.storage
          .from(FURSUIT_BUCKET)
          .upload(storagePath, fileBytes, {
            contentType: selectedPhoto.mimeType,
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(FURSUIT_BUCKET).getPublicUrl(storagePath);

        avatarUrl = publicUrl;
      }

      for (let attempt = 0; attempt < UNIQUE_INSERT_ATTEMPTS; attempt += 1) {
        const uniqueCode = await ensureUniqueCode();
        const payload: FursuitsInsert = {
          owner_id: userId,
          name: trimmedName,
          species: speciesRecord.name,
          species_id: speciesRecord.id,
          avatar_url: avatarUrl,
          unique_code: uniqueCode,
        };
        const { data: inserted, error } = await (supabase as any)
          .from('fursuits')
          .insert(payload)
          .select('id')
          .single();

        if (!error && inserted?.id) {
          createdFursuitId = inserted.id;
          break;
        }

        if (!error) {
          continue;
        }

        if (error.code !== '23505') {
          throw error;
        }
      }

      if (!createdFursuitId) {
        throw new Error('We could not save your fursuit. Please try again.');
      }

      if (allowedConventionIds.length > 0) {
        await Promise.all(
          allowedConventionIds.map((conventionId) => addFursuitConvention(createdFursuitId!, conventionId))
        );
      }

      const bioPayload: FursuitBiosInsert = {
        fursuit_id: createdFursuitId,
        version: 1,
        fursuit_name: trimmedName,
        fursuit_species: speciesRecord.name,
        owner_name: trimmedOwnerName,
        pronouns: trimmedPronouns,
        tagline: trimmedTagline,
        fun_fact: trimmedFunFact,
        likes_and_interests: trimmedLikes,
        ask_me_about: trimmedAskMeAbout,
        social_links: normalizedSocialLinks as unknown as Json,
      };

      const { error: bioError } = await (supabase as any)
        .from('fursuit_bios')
        .insert(bioPayload);

      if (bioError) {
        throw bioError;
      }

      setNameInput('');
      setSpeciesInput('');
      setSelectedSpecies(null);
      setOwnerNameInput('');
      setPronounsInput('');
      setTaglineInput('');
      setFunFactInput('');
      setLikesInput('');
      setAskMeAboutInput('');
      setSocialLinks([createEmptySocialLink()]);
      setSelectedConventionIds(new Set(profileConventionIds));
      setHasHydratedConventions(true);
      setSelectedPhoto(null);
      setPhotoError(null);
      setSubmitError(null);

      queryClient.invalidateQueries({ queryKey: [MY_SUITS_QUERY_KEY, userId] });
      router.replace('/suits');
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : "We couldn't save your fursuit right now. Please try again.";
      setSubmitError(fallbackMessage);

      if (createdFursuitId) {
        const { error: cleanupSuitError } = await (supabase as any)
          .from('fursuits')
          .delete()
          .eq('id', createdFursuitId)
          .eq('owner_id', userId);

        if (cleanupSuitError) {
          console.warn('Failed to clean up fursuit record after bio error', cleanupSuitError);
        }
      }

      if (uploadedStoragePath) {
        const { error: cleanupError } = await supabase.storage
          .from(FURSUIT_BUCKET)
          .remove([uploadedStoragePath]);

        if (cleanupError) {
          console.warn('Failed to clean up uploaded suit photo after error', cleanupError);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialLinkChange = useCallback(
    (id: string, field: 'label' | 'url', value: string) => {
      setSocialLinks((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry))
      );
    },
    []
  );

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

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Add fursuit</Text>
          <Text style={styles.title}>Tag a new suit</Text>
          <Text style={styles.subtitle}>
            Upload a photo, add a name, and TailTag will generate a unique catch code for you.
            Then fill out a bio so every catcher knows how to say hello.
          </Text>
        </View>

        <TailTagCard>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Suit photo</Text>
            <View style={styles.photoRow}>
              {selectedPhoto ? (
                <Image source={{ uri: selectedPhoto.uri }} style={styles.photoPreview} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoPlaceholderText}>No photo</Text>
                </View>
              )}
            </View>
            <View style={styles.photoButtons}>
              <TailTagButton
                variant="outline"
                onPress={handlePickPhoto}
                disabled={isSubmitting}
                style={styles.photoButtonSpacing}
              >
                Choose photo
              </TailTagButton>
              {selectedPhoto ? (
                <TailTagButton variant="ghost" onPress={handleClearPhoto} disabled={isSubmitting}>
                  Remove photo
                </TailTagButton>
              ) : null}
            </View>
            {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Name</Text>
            <TailTagInput
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Eclipse the Sergal"
              editable={!isSubmitting}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Species</Text>
            <TailTagInput
              value={speciesInput}
              onChangeText={handleSpeciesInputChange}
              placeholder="Sergal, Dutch Angel Dragon, etc."
              editable={!isSubmitting}
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
                  disabled={isSubmitting}
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
                        disabled={isSubmitting}
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
              editable={!isSubmitting}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Pronouns</Text>
            <TailTagInput
              value={pronounsInput}
              onChangeText={setPronounsInput}
              placeholder="They/them, she/they, he/him, etc."
              editable={!isSubmitting}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Tagline</Text>
            <TailTagInput
              value={taglineInput}
              onChangeText={setTaglineInput}
              placeholder="One-liner that captures your vibe"
              editable={!isSubmitting}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Fun fact</Text>
            <TailTagInput
              value={funFactInput}
              onChangeText={setFunFactInput}
              placeholder="What should catchers remember about you?"
              editable={!isSubmitting}
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
              editable={!isSubmitting}
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
              editable={!isSubmitting}
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
                    editable={!isSubmitting}
                    returnKeyType="next"
                    style={styles.socialInput}
                  />
                  <TailTagInput
                    value={entry.url}
                    onChangeText={(value) => handleSocialLinkChange(entry.id, 'url', value)}
                    placeholder="https://example.com/you"
                    editable={!isSubmitting}
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
                    disabled={isSubmitting}
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
                disabled={isSubmitting}
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
              Choose the conventions where this suit will be catchable.
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
                  disabled={isSubmitting}
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
                      disabled={!isAllowed}
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

          <TailTagButton onPress={handleSubmit} loading={isSubmitting} disabled={isSubmitting}>
            Save fursuit
          </TailTagButton>
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
    fontSize: 15,
    color: 'rgba(203,213,225,0.9)',
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  photoRow: {
    alignItems: 'flex-start',
  },
  photoPreview: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
  },
  photoPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  photoPlaceholderText: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  photoButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoButtonSpacing: {
    marginRight: spacing.sm,
  },
  textArea: {
    minHeight: 96,
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
  message: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  helperLabel: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
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
});
