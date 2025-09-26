import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../src/components/ui/TailTagInput';
import { AVATAR_BUCKET, MAX_IMAGE_SIZE } from '../../src/constants/storage';
import { useAuth } from '../../src/features/auth';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, radius } from '../../src/theme';
import { loadUriAsUint8Array } from '../../src/utils/files';
import { deriveStoragePathFromPublicUrl } from '../../src/utils/storage';
import {
  fetchProfile,
  PROFILE_QUERY_KEY,
  PROFILE_STALE_TIME,
} from '../../src/features/profile';
import type { ProfileSummary } from '../../src/features/profile';

type UploadCandidate = {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
} | null;

export default function SettingsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const queryClient = useQueryClient();
  const profileQueryKey = useMemo(() => [PROFILE_QUERY_KEY, userId] as const, [userId]);
  const {
    data: profile = null,
    error: profileError,
    isLoading: isProfileLoading,
    refetch: refetchProfile,
  } = useQuery<ProfileSummary | null, Error>({
    queryKey: profileQueryKey,
    enabled: Boolean(userId),
    staleTime: PROFILE_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchProfile(userId!),
  });

  const [usernameInput, setUsernameInput] = useState('');
  const [bioInput, setBioInput] = useState('');

  const [selectedAvatar, setSelectedAvatar] = useState<UploadCandidate>(null);
  const [shouldRemoveAvatar, setShouldRemoveAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const resetDraftFromProfile = useCallback(
    (summary: ProfileSummary | null, options: { resetMessages?: boolean } = {}) => {
      const { resetMessages = true } = options;

      setUsernameInput(summary?.username ?? '');
      setBioInput(summary?.bio ?? '');
      setSelectedAvatar(null);
      setShouldRemoveAvatar(false);
      setAvatarError(null);

      if (resetMessages) {
        setSaveMessage(null);
        setSaveError(null);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        resetDraftFromProfile(null);
        return;
      }

      resetDraftFromProfile(profile, { resetMessages: true });
      const state = queryClient.getQueryState<ProfileSummary | null>(profileQueryKey);

      if (
        !state ||
        state.isInvalidated ||
        (state.status === 'success' && Date.now() - state.dataUpdatedAt > PROFILE_STALE_TIME)
      ) {
        void refetchProfile({ throwOnError: false });
      }
    }, [profile, profileQueryKey, queryClient, refetchProfile, resetDraftFromProfile, userId])
  );

  useEffect(() => {
    if (!userId) {
      resetDraftFromProfile(null);
      return;
    }

    resetDraftFromProfile(profile, { resetMessages: false });
  }, [profile, resetDraftFromProfile, userId]);

  const handlePickAvatar = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        setAvatarError('We need media library access to pick a photo.');
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
        setAvatarError('No photo selected.');
        return;
      }

      if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE) {
        setAvatarError('Profile photos must be 5MB or smaller.');
        return;
      }

      const candidate: UploadCandidate = {
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: asset.fileName ?? `profile-${Date.now()}.jpg`,
        fileSize: asset.fileSize ?? 0,
      };

      setSelectedAvatar(candidate);
      setShouldRemoveAvatar(false);
      setAvatarError(null);
      setSaveMessage(null);
      setSaveError(null);
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : 'We could not open your photo library right now. Please try again.';
      setAvatarError(fallbackMessage);
    }
  }, []);

  const handleClearAvatar = useCallback(() => {
    setSelectedAvatar(null);
    setAvatarError(null);
    setSaveMessage(null);
  }, []);

  const handleRemoveCurrentAvatar = useCallback(() => {
    setSelectedAvatar(null);
    setShouldRemoveAvatar(true);
    setAvatarError(null);
    setSaveMessage(null);
  }, []);

  const handleCancelAvatarRemoval = useCallback(() => {
    setShouldRemoveAvatar(false);
    setAvatarError(null);
    setSaveMessage(null);
  }, []);

  const isDirty = (() => {
    const usernameChanged = (profile?.username ?? '') !== usernameInput.trim();
    const bioChanged = (profile?.bio ?? '') !== bioInput.trim();
    const avatarChanged = Boolean(selectedAvatar) || (shouldRemoveAvatar && profile?.avatar_url);
    return usernameChanged || bioChanged || avatarChanged;
  })();

  const handleSave = useCallback(async () => {
    if (!userId || isSaving || !isDirty) {
      return;
    }

    const trimmedUsername = usernameInput.trim();
    const trimmedBio = bioInput.trim();
    const normalizedUsername = trimmedUsername.length > 0 ? trimmedUsername : null;
    const normalizedBio = trimmedBio.length > 0 ? trimmedBio : null;
    const previousAvatarUrl = profile?.avatar_url ?? null;

    let uploadedAvatarPath: string | null = null;
    let nextAvatarUrl = previousAvatarUrl;

    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      if (selectedAvatar) {
        if (selectedAvatar.fileSize > MAX_IMAGE_SIZE) {
          throw new Error('Profile photos must be 5MB or smaller.');
        }

        const extension = selectedAvatar.fileName.split('.').pop()?.toLowerCase() ?? 'png';
        const storagePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
        uploadedAvatarPath = storagePath;

        const fileBytes = await loadUriAsUint8Array(selectedAvatar.uri);

        const { error: uploadError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(storagePath, fileBytes, {
            contentType: selectedAvatar.mimeType,
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);

        nextAvatarUrl = publicUrl;
      } else if (shouldRemoveAvatar) {
        nextAvatarUrl = null;
      }

      const { error } = await (supabase as any).from('profiles').upsert(
        {
          id: userId,
          username: normalizedUsername,
          bio: normalizedBio,
          avatar_url: nextAvatarUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      if (error) {
        throw error;
      }

      if (selectedAvatar && previousAvatarUrl && nextAvatarUrl !== previousAvatarUrl) {
        const objectPath = deriveStoragePathFromPublicUrl(previousAvatarUrl, AVATAR_BUCKET);
        if (objectPath) {
          await supabase.storage.from(AVATAR_BUCKET).remove([objectPath]);
        }
      }

      if (!selectedAvatar && shouldRemoveAvatar && previousAvatarUrl) {
        const objectPath = deriveStoragePathFromPublicUrl(previousAvatarUrl, AVATAR_BUCKET);
        if (objectPath) {
          await supabase.storage.from(AVATAR_BUCKET).remove([objectPath]);
        }
      }

      queryClient.setQueryData<ProfileSummary | null>(profileQueryKey, {
        username: normalizedUsername,
        bio: normalizedBio,
        avatar_url: nextAvatarUrl,
      });
      setUsernameInput(trimmedUsername);
      setBioInput(trimmedBio);
      setSelectedAvatar(null);
      setShouldRemoveAvatar(false);
      setSaveMessage('Profile updated');
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : 'We could not update your profile right now. Please try again.';
      setSaveError(fallbackMessage);

      if (uploadedAvatarPath) {
        const { error: cleanupError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([uploadedAvatarPath]);
        if (cleanupError) {
          console.warn('Failed to clean up uploaded avatar after error', cleanupError);
        }
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    userId,
    isSaving,
    isDirty,
    usernameInput,
    bioInput,
    selectedAvatar,
    shouldRemoveAvatar,
    profileQueryKey,
    queryClient,
  ]);

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setSignOutError(null);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setSignOutError(error.message);
      setIsSigningOut(false);
    }
  }, [isSigningOut]);

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Settings</Text>
          <Text style={styles.title}>Profile & account</Text>
          <Text style={styles.subtitle}>Update your details or sign out of TailTag.</Text>
        </View>

        <TailTagCard>
          {isProfileLoading ? (
            <Text style={styles.message}>Loading profile…</Text>
          ) : profileError ? (
            <Text style={styles.error}>{profileError.message}</Text>
          ) : (
            <View style={styles.profileSection}>
              <Text style={styles.sectionTitle}>Profile photo</Text>
              <View style={styles.avatarRow}>
                {selectedAvatar ? (
                  <Image source={{ uri: selectedAvatar.uri }} style={styles.avatarPreview} />
                ) : profile?.avatar_url && !shouldRemoveAvatar ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatarPreview} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarPlaceholderText}>No photo</Text>
                  </View>
                )}
              </View>
              <View style={styles.avatarButtons}>
                <TailTagButton
                  variant="outline"
                  onPress={handlePickAvatar}
                  disabled={isProfileLoading || isSaving}
                  style={styles.avatarButtonSpacing}
                >
                  Choose new photo
                </TailTagButton>
                {selectedAvatar ? (
                  <TailTagButton
                    variant="ghost"
                    onPress={handleClearAvatar}
                    disabled={isProfileLoading || isSaving}
                  >
                    Clear new photo
                  </TailTagButton>
                ) : profile?.avatar_url && !shouldRemoveAvatar ? (
                  <TailTagButton
                    variant="ghost"
                    onPress={handleRemoveCurrentAvatar}
                    disabled={isProfileLoading || isSaving}
                  >
                    Remove current photo
                  </TailTagButton>
                ) : shouldRemoveAvatar ? (
                  <TailTagButton
                    variant="ghost"
                    onPress={handleCancelAvatarRemoval}
                    disabled={isProfileLoading || isSaving}
                  >
                    Keep current photo
                  </TailTagButton>
                ) : null}
              </View>
              {shouldRemoveAvatar && !selectedAvatar ? (
                <Text style={styles.warning}>Avatar will be removed once you save.</Text>
              ) : null}
              {avatarError ? <Text style={styles.error}>{avatarError}</Text> : null}
            </View>
          )}
        </TailTagCard>

        <TailTagCard>
          <View style={styles.fieldGroup}>
            <Text style={styles.sectionTitle}>Username</Text>
            <TailTagInput
              value={usernameInput}
              onChangeText={(value) => {
                setUsernameInput(value);
                setSaveMessage(null);
                setSaveError(null);
              }}
              editable={!isProfileLoading && !isSaving}
              placeholder="Pick a handle tailtaggers will remember"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.sectionTitle}>Bio</Text>
            <TailTagInput
              value={bioInput}
              onChangeText={(value) => {
                setBioInput(value);
                setSaveMessage(null);
                setSaveError(null);
              }}
              editable={!isProfileLoading && !isSaving}
              multiline
              numberOfLines={4}
              style={styles.bioInput}
              placeholder="Share species, favorite cons, or a quick hello."
            />
          </View>
          {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
          {saveMessage ? <Text style={styles.success}>{saveMessage}</Text> : null}
          <TailTagButton
            onPress={handleSave}
            disabled={!isDirty || isProfileLoading || isSaving}
            loading={isSaving}
          >
            Save profile
          </TailTagButton>
        </TailTagCard>

        <TailTagCard>
          <Text style={styles.sectionTitle}>Account</Text>
          {signOutError ? <Text style={styles.error}>{signOutError}</Text> : null}
          <TailTagButton onPress={handleSignOut} loading={isSigningOut}>
            Log out
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
  scroll: {
    flex: 1,
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
  profileSection: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  avatarRow: {
    alignItems: 'flex-start',
  },
  avatarPreview: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  avatarPlaceholderText: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  avatarButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  avatarButtonSpacing: {
    marginRight: spacing.sm,
  },
  warning: {
    color: '#fbbf24',
    fontSize: 12,
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  bioInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
  success: {
    color: '#67e8f9',
    fontSize: 14,
  },
});
