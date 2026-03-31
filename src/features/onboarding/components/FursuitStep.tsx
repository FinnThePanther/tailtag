import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";

import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { TailTagButton } from "../../../components/ui/TailTagButton";
import { TailTagCard } from "../../../components/ui/TailTagCard";
import { TailTagInput } from "../../../components/ui/TailTagInput";
import { KeyboardAwareFormWrapper } from "../../../components/ui/KeyboardAwareFormWrapper";
import { SkipButton } from "./SkipButton";
import {
  createQuickFursuit,
  type FursuitPhotoCandidate,
} from "../../onboarding";
import { MY_SUITS_QUERY_KEY } from "../../suits";
import {
  addFursuitConvention,
  CONVENTIONS_STALE_TIME,
  createConventionsQueryOptions,
  fetchProfileConventionIds,
  isConventionActive,
  PROFILE_CONVENTIONS_QUERY_KEY,
} from "../../conventions";
import { captureNonCriticalError } from "../../../lib/sentry";
import {
  processImageForUpload,
  IMAGE_UPLOAD_PRESETS,
} from "../../../utils/images";
import { colors } from "../../../theme";
import {
  fetchFursuitColors,
  FURSUIT_COLORS_QUERY_KEY,
  MAX_FURSUIT_COLORS,
  type FursuitColorOption,
} from "../../colors";
import { styles } from "./FursuitStep.styles";

type FursuitStepProps = {
  userId: string;
  onSkip: () => void;
  onComplete: (options: { created: boolean }) => void;
};

export function FursuitStep({ userId, onSkip, onComplete }: FursuitStepProps) {
  const queryClient = useQueryClient();
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [speciesInput, setSpeciesInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [selectedPhoto, setSelectedPhoto] =
    useState<FursuitPhotoCandidate | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedColors, setSelectedColors] = useState<FursuitColorOption[]>(
    [],
  );
  const colorLoadError = colorError?.message ?? null;
  const isColorBusy = isColorLoading;

  const { data: conventions = [] } = useQuery({
    ...createConventionsQueryOptions(),
    enabled: Boolean(userId),
  });

  const { data: profileConventionIds = [] } = useQuery<string[], Error>({
    queryKey: [PROFILE_CONVENTIONS_QUERY_KEY, userId],
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchProfileConventionIds(userId),
  });

  const profileConventionIdSet = useMemo(
    () => new Set(profileConventionIds),
    [profileConventionIds],
  );

  const activeConventionIds = useMemo(
    () =>
      conventions
        .filter((c) => profileConventionIdSet.has(c.id) && isConventionActive(c))
        .map((c) => c.id),
    [conventions, profileConventionIdSet],
  );

  const handleOpenForm = () => {
    setIsExpanded(true);
  };

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

  const handlePickPhoto = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        setPhotoError("We need media access to attach a suit photo.");
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

      const asset = result.assets?.[0];

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
      const message =
        caught instanceof Error
          ? caught.message
          : "We could not open your photo library. Please try again.";
      setPhotoError(message);
    }
  };

  const handleClearPhoto = () => {
    setSelectedPhoto(null);
    setPhotoError(null);
  };

  const resetForm = () => {
    setNameInput("");
    setSpeciesInput("");
    setDescriptionInput("");
    setSelectedColors([]);
    setSelectedPhoto(null);
    setPhotoError(null);
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    const trimmedName = nameInput.trim();
    const trimmedSpecies = speciesInput.trim();
    const trimmedDescription = descriptionInput.trim();
    const colorIds = selectedColors.map((color) => color.id);

    if (!trimmedName) {
      setSubmitError("Give your fursuit a name before saving.");
      return;
    }

    if (!trimmedSpecies) {
      setSubmitError("Add a suit species so others know who to call out.");
      return;
    }

    if (colorIds.length === 0) {
      setSubmitError("Pick at least one suit color before saving.");
      return;
    }

    if (colorIds.length > MAX_FURSUIT_COLORS) {
      setSubmitError("Choose up to three colors. Remove one to add another.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const fursuitId = await createQuickFursuit({
        userId,
        name: trimmedName,
        species: trimmedSpecies,
        description: trimmedDescription.length > 0 ? trimmedDescription : null,
        photo: selectedPhoto,
        colorIds,
      });

      if (activeConventionIds.length > 0) {
        void Promise.all(
          activeConventionIds.map((conventionId) =>
            addFursuitConvention(fursuitId, conventionId).catch((error) => {
              captureNonCriticalError(error, {
                scope: 'onboarding.fursuitStep.attachConvention',
                userId,
                fursuitId,
                conventionId,
              });
            }),
          ),
        );
      }

      queryClient.invalidateQueries({ queryKey: [MY_SUITS_QUERY_KEY, userId] });

      resetForm();
      onComplete({ created: true });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "We could not save that suit right now. Please try again.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
      <TailTagCard>
        <Text style={styles.eyebrow}>Step 3</Text>
        <Text style={styles.title}>Add a fursuit (optional)</Text>
        <Text style={styles.body}>
          Fursuits are how other players recognize you. Add one now or skip and
          come back later.
        </Text>

        {!isExpanded ? (
          <View style={styles.ctaRow}>
            <TailTagButton style={styles.fullWidthCta} onPress={handleOpenForm}>
              Add my fursuit
            </TailTagButton>
            <SkipButton style={styles.fullWidthCta} onPress={onSkip} />
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Suit name</Text>
              <TailTagInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="e.g. Maple"
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Species</Text>
              <TailTagInput
                value={speciesInput}
                onChangeText={setSpeciesInput}
                placeholder="Fox, Dragon, Husky…"
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Colors</Text>
              <Text style={styles.helperLabel}>Pick up to three colors.</Text>
              {isColorBusy ? (
                <Text style={styles.helperLabel}>Loading colors…</Text>
              ) : colorLoadError ? (
                <View style={styles.helperColumn}>
                  <Text style={styles.error}>{colorLoadError}</Text>
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
                        Tap a color to add it.
                      </Text>
                    ) : null}
                    {selectedColors.map((color) => (
                      <Pressable
                        key={`selected-${color.id}`}
                        style={styles.colorSelectedChip}
                        onPress={() => handleToggleColor(color)}
                        disabled={isSubmitting}
                      >
                        <Text style={styles.colorSelectedText}>
                          {color.name}
                        </Text>
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
                        !isSelected &&
                        selectedColors.length >= MAX_FURSUIT_COLORS;
                      return (
                        <Pressable
                          key={option.id}
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
                      You've selected three colors. Tap one to swap it out.
                    </Text>
                  ) : null}
                </>
              )}
            </View>

            <View style={styles.photoSection}>
              <Text style={styles.label}>Suit photo (optional)</Text>
              {isProcessingPhoto ? (
                <View style={[styles.photo, styles.photoProcessing]}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : selectedPhoto ? (
                <View style={styles.photoPreview}>
                  <Image
                    source={selectedPhoto.uri}
                    style={styles.photo}
                    contentFit="cover"
                  />
                  <TailTagButton
                    variant="outline"
                    size="sm"
                    onPress={handleClearPhoto}
                    disabled={isSubmitting}
                  >
                    Remove photo
                  </TailTagButton>
                </View>
              ) : (
                <TailTagButton
                  variant="outline"
                  size="sm"
                  onPress={handlePickPhoto}
                  disabled={isSubmitting || isProcessingPhoto}
                >
                  Choose photo
                </TailTagButton>
              )}
              {photoError ? (
                <Text style={styles.error}>{photoError}</Text>
              ) : null}
            </View>

            {submitError ? (
              <Text style={styles.error}>{submitError}</Text>
            ) : null}

            <View style={styles.formCtaRow}>
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
                Continue
              </TailTagButton>
            </View>
          </View>
        )}
      </TailTagCard>
    </KeyboardAwareFormWrapper>
  );
}
