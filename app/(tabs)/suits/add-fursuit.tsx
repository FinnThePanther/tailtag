import { useCallback, useMemo, useState } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';

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

  const [nameInput, setNameInput] = useState('');
  const [speciesInput, setSpeciesInput] = useState('');
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

  const socialLinksCanAddMore = useMemo(
    () => socialLinks.length < SOCIAL_LINK_LIMIT,
    [socialLinks.length]
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

    setIsSubmitting(true);
    setSubmitError(null);

    let uploadedStoragePath: string | null = null;
    let createdFursuitId: string | null = null;

    try {
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
          species: trimmedSpecies,
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

      const bioPayload: FursuitBiosInsert = {
        fursuit_id: createdFursuitId,
        version: 1,
        fursuit_name: trimmedName,
        fursuit_species: trimmedSpecies,
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
      setOwnerNameInput('');
      setPronounsInput('');
      setTaglineInput('');
      setFunFactInput('');
      setLikesInput('');
      setAskMeAboutInput('');
      setSocialLinks([createEmptySocialLink()]);
      setSelectedPhoto(null);
      setPhotoError(null);
      setSubmitError(null);

      queryClient.invalidateQueries({ queryKey: [MY_SUITS_QUERY_KEY, userId] });
      router.back();
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
              onChangeText={setSpeciesInput}
              placeholder="Sergal, Dutch Angel Dragon, etc."
              editable={!isSubmitting}
              returnKeyType="next"
            />
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
