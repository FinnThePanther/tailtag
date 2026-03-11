import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { TailTagCard } from '../../../src/components/ui/TailTagCard';
import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { TailTagInput } from '../../../src/components/ui/TailTagInput';
import { KeyboardAwareFormWrapper } from '../../../src/components/ui/KeyboardAwareFormWrapper';
import {
  CAUGHT_SUITS_QUERY_KEY,
  FursuitBio,
  fetchFursuitDetail,
  fursuitDetailQueryKey,
  MY_SUITS_QUERY_KEY,
} from '../../../src/features/suits';
import type { EditableSocialLink } from '../../../src/features/suits/forms/socialLinks';
import {
  ALLOWED_SOCIAL_PLATFORMS,
  CUSTOM_PLATFORM_ID,
  createEmptySocialLink,
  createInitialSocialLinks,
  mapEditableSocialLinks,
  SOCIAL_LINK_LIMIT,
  socialLinksToSave,
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
import { createProfileQueryOptions } from '../../../src/features/profile';
import {
  ensureSpeciesEntry,
  fetchFursuitSpecies,
  FURSUIT_SPECIES_QUERY_KEY,
  normalizeSpeciesName,
  sortSpeciesOptions,
  type FursuitSpeciesOption,
} from '../../../src/features/species';
import {
  fetchFursuitColors,
  FURSUIT_COLORS_QUERY_KEY,
  MAX_FURSUIT_COLORS,
  type FursuitColorOption,
} from '../../../src/features/colors';
import { useAuth } from '../../../src/features/auth';
import {
  CatchModeSwitch,
  type CatchMode,
} from '../../../src/features/catch-confirmations';
import { supabase } from '../../../src/lib/supabase';
import { FURSUIT_BUCKET, MAX_IMAGE_SIZE } from '../../../src/constants/storage';
import { loadUriAsUint8Array } from '../../../src/utils/files';
import {
  buildImageUploadCandidate,
  inferImageExtension,
} from '../../../src/utils/images';
import { colors, spacing, radius } from '../../../src/theme';
import type { Json } from '../../../src/types/database';

type UploadCandidate = {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
} | null;

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
    data: colorOptions = [],
    error: colorError,
    isLoading: isColorLoading,
    refetch: refetchColors,
  } = useQuery<FursuitColorOption[], Error>({
    queryKey: [FURSUIT_COLORS_QUERY_KEY],
    queryFn: fetchFursuitColors,
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

  const { data: profile } = useQuery({
    ...createProfileQueryOptions(userId!),
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
  const [pronounsInput, setPronounsInput] = useState('');
  const [likesInput, setLikesInput] = useState('');
  const [askMeAboutInput, setAskMeAboutInput] = useState('');
  const [socialLinks, setSocialLinks] = useState<EditableSocialLink[]>(
    () => createInitialSocialLinks()
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<FursuitSpeciesOption | null>(null);
  const [selectedColors, setSelectedColors] = useState<FursuitColorOption[]>([]);
  const [initialColors, setInitialColors] = useState<FursuitColorOption[]>([]);
  const [catchMode, setCatchMode] = useState<CatchMode>('AUTO_ACCEPT');
  const [initialCatchMode, setInitialCatchMode] = useState<CatchMode>('AUTO_ACCEPT');
  const [selectedPhoto, setSelectedPhoto] = useState<UploadCandidate>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const speciesLoadError = speciesError?.message ?? null;
  const isSpeciesBusy = isSpeciesLoading;
  const colorLoadError = colorError?.message ?? null;
  const isColorBusy = isColorLoading;

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

  const handleToggleColor = useCallback((option: FursuitColorOption) => {
    setSelectedColors((current) => {
      const exists = current.some((entry) => entry.id === option.id);

      if (exists) {
        return current.filter((entry) => entry.id !== option.id);
      }

      if (current.length >= MAX_FURSUIT_COLORS) {
        return current;
      }

      return [...current, option];
    });
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

    setPronounsInput(bio?.pronouns ?? '');
    setLikesInput(bio?.likesAndInterests ?? '');
    setAskMeAboutInput(bio?.askMeAbout ?? '');

    const existingLinks = bio?.socialLinks ?? [];
    const linksToMap = existingLinks
      .filter((e) => (e.label?.trim() ?? '') && (e.url?.trim() ?? ''))
      .map((e) => ({ label: e.label, url: e.url }));
    setSocialLinks(mapEditableSocialLinks(linksToMap));

    const initialConventionSet = new Set((detail.conventions ?? []).map((entry) => entry.id));
    setSelectedConventionIds(new Set(initialConventionSet));
    setInitialConventionIds(initialConventionSet);
    const resolvedColors = detail.colors ?? [];
    setSelectedColors(resolvedColors);
    setInitialColors(resolvedColors);

    const resolvedCatchMode = detail.catchMode ?? 'AUTO_ACCEPT';
    setCatchMode(resolvedCatchMode);
    setInitialCatchMode(resolvedCatchMode);

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

  const handleSocialLinkChange = (
    id: string,
    field: 'platformId' | 'handle' | 'label' | 'url',
    value: string
  ) => {
    setSocialLinks((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry
      )
    );
  };

  const handleAddSocialLink = () => {
    if (!socialLinksCanAddMore) return;
    setSocialLinks((current) => [...current, createEmptySocialLink()]);
  };

  const handleRemoveSocialLink = (id: string) => {
    setSocialLinks((current) => {
      const next = current.filter((entry) => entry.id !== id);
      return next.length > 0 ? next : [createEmptySocialLink()];
    });
  };


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

      setSelectedPhoto(buildImageUploadCandidate(asset, `fursuit-${Date.now()}`));
      setPhotoError(null);
    } catch (caught) {
      setPhotoError(
        caught instanceof Error
          ? caught.message
          : 'We could not open your photo library. Please try again.'
      );
    }
  }, []);

  const handleClearPhoto = () => {
    setSelectedPhoto(null);
    setPhotoError(null);
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
    const trimmedPronouns = pronounsInput.trim();
    const trimmedLikes = likesInput.trim();
    const trimmedAskMeAbout = askMeAboutInput.trim();
    const normalizedSpeciesValue = normalizeSpeciesName(trimmedSpecies);

    const normalizedSocialLinks = socialLinksToSave(socialLinks);
    const selectedColorIds = selectedColors.map((color) => color.id);
    const previousColors = initialColors;
    const previousColorIds = previousColors.map((color) => color.id);

    if (!trimmedName) {
      setSubmitError('Give your fursuit a name before saving.');
      return;
    }

    if (!trimmedSpecies) {
      setSubmitError('Add your fursuit species before saving.');
      return;
    }

    if (selectedColorIds.length === 0) {
      setSubmitError('Pick at least one color for your fursuit.');
      return;
    }

    if (selectedColorIds.length > MAX_FURSUIT_COLORS) {
      setSubmitError('You can choose up to three colors. Remove one to add another.');
      return;
    }

    for (const entry of normalizedSocialLinks) {
      if (!entry.label || !entry.url) {
        setSubmitError('Fill in both the label and URL for each social link.');
        return;
      }
      if (!/^https?:\/\//i.test(entry.url)) {
        setSubmitError(
          'Links should include http:// or https:// so we can open them.'
        );
        return;
      }
    }

    if (selectedPhoto && selectedPhoto.fileSize > MAX_IMAGE_SIZE) {
      setSubmitError('Suit photos must be 5MB or smaller.');
      return;
    }

    const toAdd = Array.from(selectedConventionIds).filter(
      (id) => !initialConventionIds.has(id) && profileConventionIdSet.has(id)
    );
    const toRemove = Array.from(initialConventionIds).filter((id) => !selectedConventionIds.has(id));

    setIsSubmitting(true);
    setSubmitError(null);

    const client = supabase as any;
    const previousName = detail.name;
    const previousSpeciesId = detail.speciesId ?? null;
    const previousCatchMode = initialCatchMode;
    const previousAvatarUrl = detail.avatar_url;
    let updatedCoreRecord = false;
    let replacedColors = false;
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

      let newAvatarUrl: string | undefined;

      if (selectedPhoto) {
        const extension = inferImageExtension(selectedPhoto);
        const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const storagePath = `${userId}/${uniqueSuffix}.${extension}`;

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

        const { data: { publicUrl } } = supabase.storage.from(FURSUIT_BUCKET).getPublicUrl(storagePath);
        newAvatarUrl = publicUrl;
      }

      const { error: updateError } = await client
        .from('fursuits')
        .update({
          name: trimmedName,
          species_id: speciesRecord.id,
          catch_mode: catchMode,
          ...(newAvatarUrl !== undefined ? { avatar_url: newAvatarUrl } : {}),
        })
        .eq('id', fursuitId)
        .eq('owner_id', userId);

      if (updateError) {
        throw updateError;
      }

      updatedCoreRecord = true;

      const colorsChanged =
        previousColorIds.length !== selectedColorIds.length ||
        previousColorIds.some((colorId, index) => colorId !== selectedColorIds[index]);

      if (colorsChanged) {
        const { error: clearColorsError } = await client
          .from('fursuit_color_assignments')
          .delete()
          .eq('fursuit_id', fursuitId);

        if (clearColorsError) {
          throw clearColorsError;
        }

        replacedColors = true;

        if (selectedColorIds.length > 0) {
          const colorAssignments = selectedColors.map((color, index) => ({
            fursuit_id: fursuitId,
            color_id: color.id,
            position: index + 1,
          }));

          const { error: insertColorsError } = await client
            .from('fursuit_color_assignments')
            .insert(colorAssignments);

          if (insertColorsError) {
            throw insertColorsError;
          }
        }
      }

      const nextVersion = (detail.bio?.version ?? 0) + 1;

      const { error: bioError } = await client.from('fursuit_bios').insert({
        fursuit_id: fursuitId,
        version: nextVersion,
        owner_name: profile?.username ?? '',
        pronouns: trimmedPronouns,
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
      setInitialColors(selectedColors);
      setInitialCatchMode(catchMode);

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

      if (replacedColors) {
        const { error: revertClearError } = await client
          .from('fursuit_color_assignments')
          .delete()
          .eq('fursuit_id', fursuitId);

        if (revertClearError) {
          console.warn('Failed to clear color assignments after error', revertClearError);
        } else if (previousColors.length > 0) {
          const revertAssignments = previousColors.map((color, index) => ({
            fursuit_id: fursuitId,
            color_id: color.id,
            position: index + 1,
          }));

          const { error: revertInsertError } = await client
            .from('fursuit_color_assignments')
            .insert(revertAssignments);

          if (revertInsertError) {
            console.warn('Failed to restore color assignments after error', revertInsertError);
          }
        }

        setSelectedColors(previousColors);
        setInitialColors(previousColors);
      }

      if (updatedCoreRecord) {
        const { error: revertError } = await client
          .from('fursuits')
          .update({
            name: previousName,
            species_id: previousSpeciesId,
            catch_mode: previousCatchMode,
            avatar_url: previousAvatarUrl,
          })
          .eq('id', fursuitId)
          .eq('owner_id', userId);

        if (revertError) {
          console.warn('Failed to revert fursuit record after edit error', revertError);
        }

        // Also revert local state for catch mode
        setCatchMode(previousCatchMode);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const disableForm = isLoading || !detail || !isOwner || isSubmitting;

  const handleConventionToggle = useCallback(
    (conventionId: string, nextSelected: boolean) => {
      if (disableForm || !profileConventionIdSet.has(conventionId)) {
        return;
      }

      setSelectedConventionIds((current) => {
        const next = new Set(current);

        if (nextSelected) {
          next.add(conventionId);
        } else {
          next.delete(conventionId);
        }

        return next;
      });
    },
    [disableForm, profileConventionIdSet]
  );

  return (
    <View style={styles.screen}>
    <ScreenHeader title="Edit Fursuit" onBack={() => router.back()} />
    <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
      <View style={styles.header}>
          <Text style={styles.eyebrow}>Edit bio</Text>
          <Text style={styles.title}>Refresh your fursuit entry</Text>
          <Text style={styles.subtitle}>
            Update your bio and social links so players know how to say hi.
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
                <Text style={styles.label}>Suit photo</Text>
                <View style={styles.photoRow}>
                  {selectedPhoto ? (
                    <Image source={{ uri: selectedPhoto.uri }} style={styles.photoPreview} />
                  ) : detail?.avatar_url ? (
                    <Image source={{ uri: detail.avatar_url }} style={styles.photoPreview} />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Text style={styles.photoPlaceholderText}>No photo</Text>
                    </View>
                  )}
                </View>
                <View style={styles.photoButtons}>
                  <TailTagButton
                    variant="outline"
                    onPress={() => { void handlePickPhoto(); }}
                    disabled={disableForm}
                  >
                    {detail?.avatar_url || selectedPhoto ? 'Change photo' : 'Choose photo'}
                  </TailTagButton>
                  {selectedPhoto ? (
                    <TailTagButton
                      variant="ghost"
                      onPress={handleClearPhoto}
                      disabled={disableForm}
                    >
                      Remove new photo
                    </TailTagButton>
                  ) : null}
                </View>
                {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}
              </View>

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
                <Text style={styles.label}>Colors</Text>
                <Text style={styles.helperLabel}>Pick up to three colors.</Text>
                {isColorBusy ? (
                  <Text style={styles.helperLabel}>Loading colors…</Text>
                ) : colorLoadError ? (
                  <View style={styles.helperColumn}>
                    <Text style={styles.errorText}>{colorLoadError}</Text>
                    <TailTagButton
                      variant="outline"
                      size="sm"
                      onPress={() => {
                        void refetchColors({ throwOnError: false });
                      }}
                      disabled={disableForm}
                    >
                      Try again
                    </TailTagButton>
                  </View>
                ) : (
                  <>
                    <View style={styles.colorSelectedList}>
                      {selectedColors.length === 0 ? (
                        <Text style={styles.helperLabel}>No colors selected yet.</Text>
                      ) : null}
                      {selectedColors.map((color) => (
                        <Pressable
                          key={`selected-${color.id}`}
                          style={styles.colorSelectedChip}
                          onPress={() => handleToggleColor(color)}
                          disabled={disableForm}
                        >
                          <Text style={styles.colorSelectedText}>{color.name}</Text>
                          <Text style={styles.colorSelectedRemove}>Remove</Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.colorOptionList}>
                      {colorOptions.map((option) => {
                        const isSelected = selectedColors.some((color) => color.id === option.id);
                        const isAtLimit = !isSelected && selectedColors.length >= MAX_FURSUIT_COLORS;
                        return (
                          <Pressable
                            key={option.id}
                            accessibilityRole="button"
                            onPress={() => handleToggleColor(option)}
                            style={[
                              styles.colorChip,
                              isSelected ? styles.colorChipSelected : null,
                              isAtLimit ? styles.colorChipDisabled : null,
                            ]}
                            disabled={disableForm || (!isSelected && isAtLimit)}
                          >
                            <Text
                              style={[
                                styles.colorChipLabel,
                                isSelected ? styles.colorChipLabelSelected : null,
                                isAtLimit ? styles.colorChipLabelDisabled : null,
                              ]}
                            >
                              {option.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {selectedColors.length >= MAX_FURSUIT_COLORS ? (
                      <Text style={styles.helperLabel}>
                        You picked the maximum number of colors. Tap one to remove it.
                      </Text>
                    ) : null}
                  </>
                )}
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
                  Add the places where catchers can follow you. Pick a platform and
                  enter your username.
                </Text>
                <View style={styles.socialList}>
                  {socialLinks.map((entry, index) => {
                    const usedPlatformIds = socialLinks
                      .filter(
                        (e) =>
                          e.id !== entry.id &&
                          e.platformId &&
                          e.platformId !== CUSTOM_PLATFORM_ID
                      )
                      .map((e) => e.platformId);
                    const isCustom = entry.platformId === CUSTOM_PLATFORM_ID;
                    return (
                      <View key={entry.id} style={styles.socialRow}>
                        <View style={styles.socialPlatformChips}>
                          {ALLOWED_SOCIAL_PLATFORMS.map((platform) => {
                            const isSelected = entry.platformId === platform.id;
                            const isUsedElsewhere = usedPlatformIds.includes(
                              platform.id
                            );
                            return (
                              <Pressable
                                key={platform.id}
                                onPress={() =>
                                  !isUsedElsewhere &&
                                  handleSocialLinkChange(
                                    entry.id,
                                    'platformId',
                                    platform.id
                                  )
                                }
                                disabled={disableForm || isUsedElsewhere}
                                style={[
                                  styles.socialPlatformChip,
                                  isSelected && styles.socialPlatformChipSelected,
                                  isUsedElsewhere && styles.socialPlatformChipDisabled,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.socialPlatformChipText,
                                    isSelected &&
                                      styles.socialPlatformChipTextSelected,
                                    isUsedElsewhere &&
                                      styles.socialPlatformChipTextDisabled,
                                  ]}
                                >
                                  {platform.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                          <Pressable
                            onPress={() =>
                              handleSocialLinkChange(
                                entry.id,
                                'platformId',
                                CUSTOM_PLATFORM_ID
                              )
                            }
                            disabled={disableForm}
                            style={[
                              styles.socialPlatformChip,
                              isCustom && styles.socialPlatformChipSelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.socialPlatformChipText,
                                isCustom &&
                                  styles.socialPlatformChipTextSelected,
                              ]}
                            >
                              Custom
                            </Text>
                          </Pressable>
                        </View>
                        {isCustom ? (
                          <View style={styles.socialCustomInputs}>
                            <TailTagInput
                              value={entry.label ?? ''}
                              onChangeText={(value) =>
                                handleSocialLinkChange(entry.id, 'label', value)
                              }
                              placeholder="Label (e.g. Mastodon, Website)"
                              editable={!disableForm}
                              returnKeyType="next"
                              style={styles.socialInput}
                            />
                            <View style={styles.socialInputRow}>
                              <TailTagInput
                                value={entry.url ?? ''}
                                onChangeText={(value) =>
                                  handleSocialLinkChange(entry.id, 'url', value)
                                }
                                placeholder="https://example.com/you"
                                editable={!disableForm}
                                autoCapitalize="none"
                                keyboardType="url"
                                returnKeyType={
                                  index === socialLinks.length - 1
                                    ? 'done'
                                    : 'next'
                                }
                                onSubmitEditing={
                                  index === socialLinks.length - 1
                                    ? handleSubmit
                                    : undefined
                                }
                                style={styles.socialInput}
                              />
                              <TailTagButton
                                variant="ghost"
                                size="sm"
                                onPress={() =>
                                  handleRemoveSocialLink(entry.id)
                                }
                                disabled={disableForm}
                                style={styles.socialRemoveButton}
                              >
                                Remove
                              </TailTagButton>
                            </View>
                          </View>
                        ) : (
                          <View style={styles.socialInputRow}>
                            <TailTagInput
                              value={entry.handle}
                              onChangeText={(value) =>
                                handleSocialLinkChange(
                                  entry.id,
                                  'handle',
                                  value
                                )
                              }
                              placeholder="Username"
                              editable={!disableForm}
                              autoCapitalize="none"
                              keyboardType="default"
                              returnKeyType={
                                index === socialLinks.length - 1
                                  ? 'done'
                                  : 'next'
                              }
                              onSubmitEditing={
                                index === socialLinks.length - 1
                                  ? handleSubmit
                                  : undefined
                              }
                              style={styles.socialInput}
                            />
                            <TailTagButton
                              variant="ghost"
                              size="sm"
                              onPress={() =>
                                handleRemoveSocialLink(entry.id)
                              }
                              disabled={disableForm}
                              style={styles.socialRemoveButton}
                            >
                              Remove
                            </TailTagButton>
                          </View>
                        )}
                      </View>
                    );
                  })}
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
                  <Text style={styles.helperLabel}>
                    You can add up to {SOCIAL_LINK_LIMIT} links.
                  </Text>
                )}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Catch settings</Text>
                <CatchModeSwitch
                  value={catchMode}
                  onChange={setCatchMode}
                  disabled={disableForm}
                />
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
                          onToggle={(conventionId, nextSelected) =>
                            handleConventionToggle(conventionId, nextSelected)
                          }
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
    </KeyboardAwareFormWrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
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
  colorSelectedList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  colorSelectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
    backgroundColor: 'rgba(37,99,235,0.18)',
  },
  colorSelectedText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '600',
  },
  colorSelectedRemove: {
    marginLeft: spacing.xs,
    color: 'rgba(148,163,184,0.9)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  colorOptionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  colorChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  colorChipSelected: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56,189,248,0.2)',
  },
  colorChipDisabled: {
    opacity: 0.4,
  },
  colorChipLabel: {
    color: 'rgba(203,213,225,0.95)',
    fontSize: 13,
  },
  colorChipLabelSelected: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  colorChipLabelDisabled: {
    color: 'rgba(148,163,184,0.6)',
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
    gap: spacing.md,
  },
  socialRow: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  socialPlatformChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  socialPlatformChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  socialPlatformChipSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99,102,241,0.2)',
  },
  socialPlatformChipDisabled: {
    opacity: 0.5,
  },
  socialPlatformChipText: {
    color: colors.foreground,
    fontSize: 12,
  },
  socialPlatformChipTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  socialPlatformChipTextDisabled: {
    color: 'rgba(148,163,184,0.7)',
  },
  socialInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  socialInput: {
    flex: 1,
  },
  socialRemoveButton: {},
  socialCustomInputs: {
    flexDirection: 'column',
    gap: spacing.sm,
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
  photoRow: {
    alignItems: 'center',
  },
  photoPreview: {
    width: '50%',
    aspectRatio: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
  },
  photoPlaceholder: {
    width: '50%',
    aspectRatio: 1,
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
    gap: spacing.sm,
  },
});
