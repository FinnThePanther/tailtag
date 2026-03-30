import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { TailTagButton } from "../../../src/components/ui/TailTagButton";
import { TailTagCard } from "../../../src/components/ui/TailTagCard";
import { TailTagInput } from "../../../src/components/ui/TailTagInput";
import { KeyboardAwareFormWrapper } from "../../../src/components/ui/KeyboardAwareFormWrapper";
import { FURSUIT_BUCKET } from "../../../src/constants/storage";
import {
  UNIQUE_CODE_ATTEMPTS,
  UNIQUE_INSERT_ATTEMPTS,
} from "../../../src/constants/codes";
import { useAuth } from "../../../src/features/auth";
import { supabase } from "../../../src/lib/supabase";
import { captureNonCriticalError } from "../../../src/lib/sentry";
import { generateUniqueCodeCandidate } from "../../../src/utils/code";
import { loadUriAsUint8Array } from "../../../src/utils/files";
import {
  processImageForUpload,
  IMAGE_UPLOAD_PRESETS,
} from "../../../src/utils/images";
import { colors, spacing, radius } from "../../../src/theme";
import {
  MY_SUITS_QUERY_KEY,
  MY_SUITS_COUNT_QUERY_KEY,
  createMySuitsCountQueryOptions,
} from "../../../src/features/suits";
import { MAX_FURSUITS_PER_USER } from "../../../src/constants/fursuits";
import {
  CatchModeSwitch,
  type CatchMode,
} from "../../../src/features/catch-confirmations";
import {
  ensureSpeciesEntry,
  fetchFursuitSpecies,
  FURSUIT_SPECIES_QUERY_KEY,
  normalizeSpeciesName,
  sortSpeciesOptions,
  type FursuitSpeciesOption,
} from "../../../src/features/species";
import {
  fetchFursuitColors,
  FURSUIT_COLORS_QUERY_KEY,
  MAX_FURSUIT_COLORS,
  type FursuitColorOption,
} from "../../../src/features/colors";
import {
  addFursuitConvention,
  CONVENTIONS_STALE_TIME,
  createConventionsQueryOptions,
  fetchProfileConventionIds,
  isConventionActive,
  PROFILE_CONVENTIONS_QUERY_KEY,
} from "../../../src/features/conventions";
import { ConventionToggle } from "../../../src/components/conventions/ConventionToggle";
import { createProfileQueryOptions } from "../../../src/features/profile";
import { emitGameplayEvent } from "../../../src/features/events";
import { DAILY_TASKS_QUERY_KEY } from "../../../src/features/daily-tasks/hooks";
import type {
  FursuitBiosInsert,
  FursuitsInsert,
  Json,
} from "../../../src/types/database";
import {
  ALLOWED_SOCIAL_PLATFORMS,
  CUSTOM_PLATFORM_ID,
  createEmptySocialLink,
  createInitialSocialLinks,
  SOCIAL_LINK_LIMIT,
  socialLinksToSave,
} from "../../../src/features/suits/forms/socialLinks";
import type { EditableSocialLink } from "../../../src/features/suits/forms/socialLinks";

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

  const { data: suitCount = 0 } = useQuery({
    ...createMySuitsCountQueryOptions(userId!),
    enabled: Boolean(userId),
  });

  const { data: profile } = useQuery({
    ...createProfileQueryOptions(userId!),
    enabled: Boolean(userId),
  });

  const isAtFursuitLimit = suitCount >= MAX_FURSUITS_PER_USER;

  const [nameInput, setNameInput] = useState("");
  const [speciesInput, setSpeciesInput] = useState("");
  const [selectedSpecies, setSelectedSpecies] =
    useState<FursuitSpeciesOption | null>(null);
  const [selectedColors, setSelectedColors] = useState<FursuitColorOption[]>(
    [],
  );
  const [pronounsInput, setPronounsInput] = useState("");
  const [likesInput, setLikesInput] = useState("");
  const [askMeAboutInput, setAskMeAboutInput] = useState("");
  const [socialLinks, setSocialLinks] = useState<EditableSocialLink[]>(
    () => createInitialSocialLinks(),
  );
  const [catchMode, setCatchMode] = useState<CatchMode>("AUTO_ACCEPT");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [selectedPhoto, setSelectedPhoto] = useState<UploadCandidate>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const speciesLoadError = speciesError?.message ?? null;
  const isSpeciesBusy = isSpeciesLoading;
  const colorLoadError = colorError?.message ?? null;
  const isColorBusy = isColorLoading;

  const normalizedSpeciesInput = useMemo(
    () => normalizeSpeciesName(speciesInput),
    [speciesInput],
  );

  const speciesSuggestions = useMemo(() => {
    if (speciesOptions.length === 0) {
      return [] as FursuitSpeciesOption[];
    }

    if (!normalizedSpeciesInput) {
      return speciesOptions.slice(0, 12);
    }

    return speciesOptions
      .filter((option) =>
        option.normalizedName.includes(normalizedSpeciesInput),
      )
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

      const match =
        speciesOptions.find((option) => option.normalizedName === normalized) ??
        null;
      setSelectedSpecies(match);
    },
    [speciesOptions],
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

  const conventionsQueryOptions = useMemo(
    () => createConventionsQueryOptions(),
    [],
  );
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

  const [selectedConventionIds, setSelectedConventionIds] = useState<
    Set<string>
  >(new Set());
  const [hasHydratedConventions, setHasHydratedConventions] = useState(false);

  const socialLinksCanAddMore = useMemo(
    () => socialLinks.length < SOCIAL_LINK_LIMIT,
    [socialLinks.length],
  );

  const profileConventionIdSet = useMemo(
    () => new Set(profileConventionIds),
    [profileConventionIds],
  );

  const activeProfileConventionIds = useMemo(
    () =>
      conventions
        .filter((c) => profileConventionIdSet.has(c.id) && isConventionActive(c))
        .map((c) => c.id),
    [conventions, profileConventionIdSet],
  );

  const isConventionsBusy = isConventionsLoading || isProfileConventionsLoading;
  const conventionsLoadError =
    conventionsError?.message ?? profileConventionsError?.message ?? null;

  useEffect(() => {
    if (!userId) {
      setSelectedConventionIds(new Set());
      setHasHydratedConventions(false);
      return;
    }

    if (!hasHydratedConventions && !isConventionsBusy) {
      setSelectedConventionIds(new Set(activeProfileConventionIds));
      setHasHydratedConventions(true);
      return;
    }

    setSelectedConventionIds((current) => {
      const filtered = new Set(
        [...current].filter((id) => profileConventionIdSet.has(id)),
      );
      return filtered.size === current.size ? current : filtered;
    });
  }, [
    hasHydratedConventions,
    activeProfileConventionIds,
    profileConventionIdSet,
    isConventionsBusy,
    userId,
  ]);

  const handleConventionToggle = useCallback(
    (conventionId: string, nextSelected: boolean) => {
      if (!profileConventionIdSet.has(conventionId)) {
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
    [profileConventionIdSet],
  );

  const ensureUniqueCode = useCallback(async () => {
    const client = supabase as any;

    for (let attempt = 0; attempt < UNIQUE_CODE_ATTEMPTS; attempt += 1) {
      const candidate = generateUniqueCodeCandidate();
      const { data, error } = await client
        .from("fursuits")
        .select("id")
        .eq("unique_code", candidate)
        .limit(1);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return candidate;
      }
    }

    throw new Error(
      "We couldn't generate a unique tag code. Please try again.",
    );
  }, []);

  const handlePickPhoto = useCallback(async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        setPhotoError("We need media library access to select a photo.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset) {
        setPhotoError("No photo selected.");
        return;
      }

      setIsProcessingPhoto(true);
      setPhotoError(null);
      try {
        const processed = await processImageForUpload(asset.uri, IMAGE_UPLOAD_PRESETS.fursuitAvatar);
        setSelectedPhoto({
          uri: processed.uri,
          mimeType: "image/jpeg",
          fileName: `fursuit-${Date.now()}.jpg`,
          fileSize: 0,
        });
      } catch {
        setPhotoError("We could not process that photo. Please try another.");
      } finally {
        setIsProcessingPhoto(false);
      }
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : "We could not open your photo library. Please try again.";
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

    if (isAtFursuitLimit) {
      setSubmitError(
        `You can only have ${MAX_FURSUITS_PER_USER} fursuits. Delete an existing fursuit to add a new one.`,
      );
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

    if (!trimmedName) {
      setSubmitError("Give your fursuit a name before saving.");
      return;
    }

    if (!trimmedSpecies) {
      setSubmitError("Add your fursuit species before saving.");
      return;
    }

    if (selectedColorIds.length === 0) {
      setSubmitError("Pick at least one color for your fursuit.");
      return;
    }

    if (selectedColorIds.length > MAX_FURSUIT_COLORS) {
      setSubmitError(
        "You can choose up to three colors. Remove one to add another.",
      );
      return;
    }

    for (const entry of normalizedSocialLinks) {
      if (!entry.label || !entry.url) {
        setSubmitError("Fill in both the label and URL for each social link.");
        return;
      }
      if (!/^https?:\/\//i.test(entry.url)) {
        setSubmitError(
          "Links should include http:// or https:// so we can open them.",
        );
        return;
      }
    }

    const allowedConventionIds = Array.from(selectedConventionIds).filter(
      (id) => profileConventionIdSet.has(id),
    );

    setIsSubmitting(true);
    setSubmitError(null);

    let uploadedStoragePath: string | null = null;
    let createdFursuitId: string | null = null;

    try {
      const speciesRecord =
        selectedSpecies &&
        selectedSpecies.normalizedName === normalizedSpeciesValue
          ? selectedSpecies
          : await ensureSpeciesEntry(trimmedSpecies);

      setSelectedSpecies(speciesRecord);
      setSpeciesInput(speciesRecord.name);
      queryClient.setQueryData<FursuitSpeciesOption[]>(
        [FURSUIT_SPECIES_QUERY_KEY],
        (current = []) => {
          const existingIndex = current.findIndex(
            (option) => option.id === speciesRecord.id,
          );

          if (existingIndex >= 0) {
            const next = [...current];
            next[existingIndex] = speciesRecord;
            return sortSpeciesOptions(next);
          }

          return sortSpeciesOptions([...current, speciesRecord]);
        },
      );
      void queryClient.invalidateQueries({
        queryKey: [FURSUIT_SPECIES_QUERY_KEY],
      });

      let avatarUrl: string | null = null;

      if (selectedPhoto) {
        const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const storagePath = `${userId}/${uniqueSuffix}.jpg`;
        uploadedStoragePath = storagePath;

        const fileBytes = await loadUriAsUint8Array(selectedPhoto.uri);

        const { error: uploadError } = await supabase.storage
          .from(FURSUIT_BUCKET)
          .upload(storagePath, fileBytes, {
            contentType: 'image/jpeg',
            upsert: false,
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
          species_id: speciesRecord.id,
          avatar_url: avatarUrl,
          unique_code: uniqueCode,
          catch_mode: catchMode,
        };
        const { data: inserted, error } = await (supabase as any)
          .from("fursuits")
          .insert(payload)
          .select("id")
          .single();

        if (!error && inserted?.id) {
          createdFursuitId = inserted.id;
          break;
        }

        if (!error) {
          continue;
        }

        if (error.code !== "23505") {
          throw error;
        }
      }

      if (!createdFursuitId) {
        throw new Error("We could not save your fursuit. Please try again.");
      }

      if (selectedColorIds.length > 0) {
        const colorAssignments = selectedColors.map((color, index) => ({
          fursuit_id: createdFursuitId!,
          color_id: color.id,
          position: index + 1,
        }));

        const { error: colorAssignmentError } = await (supabase as any)
          .from("fursuit_color_assignments")
          .insert(colorAssignments);

        if (colorAssignmentError) {
          throw colorAssignmentError;
        }
      }

      if (allowedConventionIds.length > 0) {
        await Promise.all(
          allowedConventionIds.map((conventionId) =>
            addFursuitConvention(createdFursuitId!, conventionId),
          ),
        );
      }

      const bioPayload: FursuitBiosInsert = {
        fursuit_id: createdFursuitId,
        version: 1,
        owner_name: profile?.username ?? "",
        pronouns: trimmedPronouns,
        likes_and_interests: trimmedLikes,
        ask_me_about: trimmedAskMeAbout,
        social_links: normalizedSocialLinks as unknown as Json,
      };

      const { error: bioError } = await (supabase as any)
        .from("fursuit_bios")
        .insert(bioPayload);

      if (bioError) {
        throw bioError;
      }

      setNameInput("");
      setSpeciesInput("");
      setSelectedSpecies(null);
      setSelectedColors([]);
      setPronounsInput("");
      setLikesInput("");
      setAskMeAboutInput("");
      setSocialLinks(createInitialSocialLinks());
      setCatchMode("AUTO_ACCEPT");
      setSelectedConventionIds(new Set(activeProfileConventionIds));
      setHasHydratedConventions(true);
      setSelectedPhoto(null);
      setPhotoError(null);
      setSubmitError(null);

      queryClient.invalidateQueries({ queryKey: [MY_SUITS_QUERY_KEY, userId] });
      void queryClient.invalidateQueries({
        queryKey: [MY_SUITS_COUNT_QUERY_KEY, userId],
      });
      void queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });

      // Navigate immediately
      router.replace("/suits");

      // Fire-and-forget: emit event without blocking navigation
      emitGameplayEvent({
        type: "fursuit_created",
        payload: {
          fursuit_id: createdFursuitId,
          owner_id: userId,
          convention_ids: allowedConventionIds,
        },
      }).catch((error) => {
        captureNonCriticalError(error, {
          scope: "suits.addFursuit.eventEmission",
          userId,
          fursuitId: createdFursuitId,
        });
      });
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : "We couldn't save your fursuit right now. Please try again.";
      setSubmitError(fallbackMessage);

      if (createdFursuitId) {
        const { error: cleanupSuitError } = await (supabase as any)
          .from("fursuits")
          .delete()
          .eq("id", createdFursuitId)
          .eq("owner_id", userId);

        if (cleanupSuitError) {
          console.warn(
            "Failed to clean up fursuit record after bio error",
            cleanupSuitError,
          );
        }
      }

      if (uploadedStoragePath) {
        const { error: cleanupError } = await supabase.storage
          .from(FURSUIT_BUCKET)
          .remove([uploadedStoragePath]);

        if (cleanupError) {
          console.warn(
            "Failed to clean up uploaded suit photo after error",
            cleanupError,
          );
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialLinkChange = useCallback(
    (
      id: string,
      field: "platformId" | "handle" | "label" | "url",
      value: string,
    ) => {
      setSocialLinks((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, [field]: value } : entry,
        ),
      );
    },
    [],
  );

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

  return (
    <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
      {isAtFursuitLimit && (
        <TailTagCard style={styles.limitBanner}>
          <Text style={styles.limitBannerText}>
            You have reached the maximum of {MAX_FURSUITS_PER_USER} fursuits.
            Delete an existing fursuit to add a new one.
          </Text>
          <TailTagButton
            variant="outline"
            onPress={() => router.push("/suits")}
          >
            Manage my suits
          </TailTagButton>
        </TailTagCard>
      )}

      <View style={styles.formCard}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Suit photo</Text>
          <View style={styles.photoRow}>
            {isProcessingPhoto ? (
              <View style={[styles.photoPreview, styles.photoProcessing]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : selectedPhoto ? (
              <Image
                source={selectedPhoto.uri}
                style={styles.photoPreview}
                contentFit="cover"
              />
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
              disabled={isSubmitting || isProcessingPhoto}
            >
              Choose photo
            </TailTagButton>
            {selectedPhoto ? (
              <TailTagButton
                variant="ghost"
                onPress={handleClearPhoto}
                disabled={isSubmitting}
              >
                Remove photo
              </TailTagButton>
            ) : null}
          </View>
          {photoError ? (
            <Text style={styles.errorText}>{photoError}</Text>
          ) : null}
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
            Tap a suggestion or keep typing to add a new species to the shared
            list.
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
                {normalizedSpeciesInput
                  ? "Matching species"
                  : "Popular species"}
              </Text>
              <View style={styles.speciesSuggestionList}>
                {speciesSuggestions.map((option) => {
                  const isSelected = selectedSpecies?.id === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      onPress={() => handleSpeciesSelect(option)}
                      style={[
                        styles.colorChip,
                        isSelected ? styles.colorChipSelected : null,
                      ]}
                      disabled={isSubmitting}
                    >
                      <Text
                        style={[
                          styles.colorChipLabel,
                          isSelected ? styles.colorChipLabelSelected : null,
                        ]}
                      >
                        {option.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
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
                disabled={isSubmitting}
              >
                Try again
              </TailTagButton>
            </View>
          ) : (
            <>
              <View style={styles.colorSelectedList}>
                {selectedColors.length === 0 ? (
                  <Text style={styles.helperLabel}>
                    No colors selected yet.
                  </Text>
                ) : null}
                {selectedColors.map((color) => (
                  <Pressable
                    key={`selected-${color.id}`}
                    style={styles.colorSelectedChip}
                    onPress={() => handleToggleColor(color)}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.colorSelectedText}>{color.name}</Text>
                    <Text style={styles.colorSelectedRemove}>Remove</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.colorOptionList}>
                {colorOptions.map((option) => {
                  const isSelected = selectedColors.some(
                    (color) => color.id === option.id,
                  );
                  const isAtLimit =
                    !isSelected && selectedColors.length >= MAX_FURSUIT_COLORS;
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
                      disabled={isSubmitting || (!isSelected && isAtLimit)}
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
          <Text style={styles.label}>Fursuit Pronouns</Text>
          <TailTagInput
            value={pronounsInput}
            onChangeText={setPronounsInput}
            placeholder="he/him, she/her, they/them, etc."
            editable={!isSubmitting}
            returnKeyType="next"
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
                    e.platformId !== CUSTOM_PLATFORM_ID,
                )
                .map((e) => e.platformId);
              const isCustom = entry.platformId === CUSTOM_PLATFORM_ID;
              return (
                <View key={entry.id} style={styles.socialRow}>
                  <View style={styles.socialPlatformChips}>
                    {ALLOWED_SOCIAL_PLATFORMS.map((platform) => {
                      const isSelected = entry.platformId === platform.id;
                      const isUsedElsewhere = usedPlatformIds.includes(
                        platform.id,
                      );
                      return (
                        <Pressable
                          key={platform.id}
                          onPress={() =>
                            !isUsedElsewhere &&
                            handleSocialLinkChange(
                              entry.id,
                              "platformId",
                              platform.id,
                            )
                          }
                          disabled={isSubmitting || isUsedElsewhere}
                          style={[
                            styles.socialPlatformChip,
                            isSelected && styles.socialPlatformChipSelected,
                            isUsedElsewhere && styles.socialPlatformChipDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.socialPlatformChipText,
                              isSelected && styles.socialPlatformChipTextSelected,
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
                          "platformId",
                          CUSTOM_PLATFORM_ID,
                        )
                      }
                      disabled={isSubmitting}
                      style={[
                        styles.socialPlatformChip,
                        isCustom && styles.socialPlatformChipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.socialPlatformChipText,
                          isCustom && styles.socialPlatformChipTextSelected,
                        ]}
                      >
                        Custom
                      </Text>
                    </Pressable>
                  </View>
                  {isCustom ? (
                    <View style={styles.socialCustomInputs}>
                      <TailTagInput
                        value={entry.label ?? ""}
                        onChangeText={(value) =>
                          handleSocialLinkChange(entry.id, "label", value)
                        }
                        placeholder="Label (e.g. Mastodon, Website)"
                        editable={!isSubmitting}
                        returnKeyType="next"
                        style={styles.socialInput}
                      />
                      <View style={styles.socialInputRow}>
                        <TailTagInput
                          value={entry.url ?? ""}
                          onChangeText={(value) =>
                            handleSocialLinkChange(entry.id, "url", value)
                          }
                          placeholder="https://example.com/you"
                          editable={!isSubmitting}
                          autoCapitalize="none"
                          keyboardType="url"
                          returnKeyType={
                            index === socialLinks.length - 1 ? "done" : "next"
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
                          onPress={() => handleRemoveSocialLink(entry.id)}
                          disabled={isSubmitting}
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
                          handleSocialLinkChange(entry.id, "handle", value)
                        }
                        placeholder="Username"
                        editable={!isSubmitting}
                        autoCapitalize="none"
                        keyboardType="default"
                        returnKeyType={
                          index === socialLinks.length - 1 ? "done" : "next"
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
                        onPress={() => handleRemoveSocialLink(entry.id)}
                        disabled={isSubmitting}
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
              disabled={isSubmitting}
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
            disabled={isSubmitting}
          />
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
            <Text style={styles.message}>
              No conventions are available yet. Check back soon.
            </Text>
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
                          ? "Assigned"
                          : "Tap to assign"
                        : "Opt in via Settings"
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

        {submitError ? (
          <Text style={styles.errorText}>{submitError}</Text>
        ) : null}

        <TailTagButton
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          Save fursuit
        </TailTagButton>
      </View>
    </KeyboardAwareFormWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  limitBanner: {
    gap: spacing.md,
  },
  limitBannerText: {
    fontSize: 14,
    color: "#fca5a5",
    lineHeight: 20,
  },
  formCard: {
    gap: spacing.lg,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
  },
  photoRow: {
    alignItems: "center",
  },
  photoPreview: {
    width: "50%",
    aspectRatio: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.3)",
  },
  photoProcessing: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(30,41,59,0.8)",
  },
  photoPlaceholder: {
    width: "50%",
    aspectRatio: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.3)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(30,41,59,0.6)",
  },
  photoPlaceholderText: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  photoButtons: {
    gap: spacing.sm,
  },
  textArea: {
    minHeight: 96,
  },
  helperColumn: {
    gap: spacing.sm,
  },
  colorSelectedList: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
  },
  colorSelectedChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.3)",
    backgroundColor: "rgba(37,99,235,0.18)",
  },
  colorSelectedText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600",
  },
  colorSelectedRemove: {
    marginLeft: spacing.xs,
    color: "rgba(148,163,184,0.9)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  colorOptionList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  colorChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    backgroundColor: "rgba(30,41,59,0.6)",
  },
  colorChipSelected: {
    borderColor: "#38bdf8",
    backgroundColor: "rgba(56,189,248,0.2)",
  },
  colorChipDisabled: {
    opacity: 0.4,
  },
  colorChipLabel: {
    color: "rgba(203,213,225,0.95)",
    fontSize: 13,
  },
  colorChipLabelSelected: {
    color: "#38bdf8",
    fontWeight: "600",
  },
  colorChipLabelDisabled: {
    color: "rgba(148,163,184,0.6)",
  },
  speciesSuggestionSection: {
    gap: spacing.xs,
  },
  speciesSuggestionList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  conventionList: {
    gap: spacing.sm,
  },
  message: {
    color: "rgba(203,213,225,0.9)",
    fontSize: 14,
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 14,
  },
  helperLabel: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 12,
  },
  socialList: {
    gap: spacing.md,
  },
  socialRow: {
    flexDirection: "column",
    gap: spacing.sm,
  },
  socialPlatformChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  socialPlatformChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    backgroundColor: "rgba(30,41,59,0.6)",
  },
  socialPlatformChipSelected: {
    borderColor: colors.primary,
    backgroundColor: "rgba(99,102,241,0.2)",
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
    fontWeight: "600",
  },
  socialPlatformChipTextDisabled: {
    color: "rgba(148,163,184,0.7)",
  },
  socialInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  socialCustomInputs: {
    flexDirection: "column",
    gap: spacing.sm,
  },
  socialInput: {
    flex: 1,
  },
  socialRemoveButton: {},
});
