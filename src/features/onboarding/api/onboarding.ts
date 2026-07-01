import { supabase } from '../../../lib/supabase';
import { FURSUIT_BUCKET } from '../../../constants/storage';
import { UNIQUE_CODE_ATTEMPTS, UNIQUE_INSERT_ATTEMPTS } from '../../../constants/codes';
import { generateUniqueCodeCandidate } from '../../../utils/code';
import { loadUriAsUint8Array } from '../../../utils/files';
import {
  addMonitoringBreadcrumb,
  captureHandledMessage,
  captureSupabaseError,
} from '../../../lib/sentry';
import { buildAuthenticatedStorageObjectUrl } from '../../../utils/supabase-image';
import { emitGameplayEvent } from '../../events';

import type { FursuitBiosInsert, FursuitsInsert } from '@/types/database';
import {
  MAX_FURSUIT_COLORS,
  MAX_FURSUIT_COLOR_DETAILS_LENGTH,
  OTHER_FURSUIT_COLOR_NORMALIZED_NAME,
  normalizeFursuitColorDetails,
} from '@/features/colors';
import { getMaxFursuitsForFeatureState, MAX_FURSUITS_PER_USER } from '@/constants/fursuits';
import { ensureSpeciesEntry } from '@/features/species';
import { normalizeVisibilityAudience, type VisibilityAudience } from '@/features/adult-boundary';
import {
  EXPANDED_FURSUIT_LIMIT_FEATURE_KEY,
  isFeatureEnabledForProfile,
} from '@/features/feature-flags';
import {
  getInteractionPreferencesError,
  normalizeInteractionBadges,
  normalizeSocialSignal,
  type InteractionBadgeKey,
  type SocialSignalKey,
} from '@/features/interaction-preferences';

export const GETTING_STARTED_ACHIEVEMENT_KEY = 'getting_started';

export type FursuitPhotoCandidate = {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
};

const generateAvailableFursuitCode = async (): Promise<string> => {
  const client = supabase as any;

  for (let attempt = 0; attempt < UNIQUE_CODE_ATTEMPTS; attempt += 1) {
    const candidate = generateUniqueCodeCandidate();
    const { data, error } = await client
      .from('fursuits')
      .select('id')
      .ilike('unique_code', candidate)
      .limit(1);

    if (error) {
      throw new Error(`We couldn't generate a tag code right now: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return candidate;
    }
  }

  captureHandledMessage('Ran out of attempts while generating unique fursuit code', {
    scope: 'onboarding.generateAvailableFursuitCode',
  });
  throw new Error("We couldn't generate a unique tag code. Please try again.");
};

const uploadFursuitPhoto = async (userId: string, photo: FursuitPhotoCandidate) => {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `${userId}/${uniqueSuffix}.jpg`;

  const fileBytes = await loadUriAsUint8Array(photo.uri);

  const { error: uploadError } = await supabase.storage
    .from(FURSUIT_BUCKET)
    .upload(storagePath, fileBytes, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const avatarUrl = buildAuthenticatedStorageObjectUrl(FURSUIT_BUCKET, storagePath);

  return { storagePath, avatarUrl };
};

export async function createQuickFursuit(options: {
  userId: string;
  name: string;
  species: string;
  description: string | null;
  colorDetails?: string | null;
  requiresColorDetails?: boolean;
  photo: FursuitPhotoCandidate | null;
  photoCredit?: string | null;
  colorIds: string[];
  hideOwnerPublicly?: boolean;
  visibilityAudience?: VisibilityAudience;
  socialSignal?: SocialSignalKey | null;
  interactionBadges?: InteractionBadgeKey[];
}): Promise<string> {
  const { userId, name, species, description, photo, colorIds } = options;
  const client = supabase as any;

  // Check fursuit count limit
  const { data: count, error: countError } = await client.rpc('count_user_fursuits', {
    p_user_id: userId,
  });

  if (countError) {
    throw new Error(`We couldn't verify your fursuit count: ${countError.message}`);
  }

  const fursuitCount = typeof count === 'number' ? count : 0;
  const expandedFursuitLimitEnabled =
    fursuitCount >= MAX_FURSUITS_PER_USER
      ? await isFeatureEnabledForProfile(EXPANDED_FURSUIT_LIMIT_FEATURE_KEY, userId)
      : false;
  const fursuitLimit = getMaxFursuitsForFeatureState(expandedFursuitLimitEnabled);

  if (fursuitCount >= fursuitLimit) {
    throw new Error(
      expandedFursuitLimitEnabled
        ? "You've reached your fursuit limit."
        : `You can only have ${MAX_FURSUITS_PER_USER} fursuits.`,
    );
  }

  let uploadedStoragePath: string | null = null;
  let avatarUrl: string | null = null;

  try {
    if (photo) {
      const uploaded = await uploadFursuitPhoto(userId, photo);
      uploadedStoragePath = uploaded.storagePath;
      avatarUrl = uploaded.avatarUrl;
    }

    const normalizedName = name.trim();
    const normalizedSpecies = species.trim();
    const normalizedDescription = description?.trim() ?? null;
    const normalizedColorDetails = normalizeFursuitColorDetails(options.colorDetails);
    const normalizedPhotoCredit = photo ? (options.photoCredit ?? '').trim() : '';
    const visibilityAudience = normalizeVisibilityAudience(options.visibilityAudience);
    const socialSignal = normalizeSocialSignal(options.socialSignal);
    const interactionBadges = normalizeInteractionBadges(options.interactionBadges);
    const normalizedColorIds = Array.from(
      new Set(
        (Array.isArray(colorIds) ? colorIds : [])
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value.length > 0),
      ),
    );

    if (!normalizedName) {
      throw new Error('Give your fursuit a name before saving.');
    }

    if (!normalizedSpecies) {
      throw new Error('Add a species so other players know who you are.');
    }

    if (normalizedColorIds.length > MAX_FURSUIT_COLORS) {
      throw new Error(`You can choose up to ${MAX_FURSUIT_COLORS} colors.`);
    }

    const { data: selectedColorRecords, error: selectedColorsError } =
      normalizedColorIds.length > 0
        ? await client
            .from('fursuit_colors')
            .select('id, normalized_name')
            .in('id', normalizedColorIds)
        : { data: [], error: null };

    if (selectedColorsError) {
      captureSupabaseError(selectedColorsError, {
        scope: 'onboarding.createQuickFursuit',
        action: 'verifySelectedColors',
        userId,
        selectedColorCount: normalizedColorIds.length,
      });
      throw new Error(`We couldn't verify your fursuit colors: ${selectedColorsError.message}`);
    }

    if ((selectedColorRecords ?? []).length !== normalizedColorIds.length) {
      throw new Error("We couldn't verify every fursuit color. Please pick your colors again.");
    }

    if (
      normalizedColorDetails &&
      normalizedColorDetails.length > MAX_FURSUIT_COLOR_DETAILS_LENGTH
    ) {
      throw new Error(`Keep color details under ${MAX_FURSUIT_COLOR_DETAILS_LENGTH} characters.`);
    }

    const selectedOtherColor = (selectedColorRecords ?? []).some(
      (color: { normalized_name?: unknown }) =>
        color.normalized_name === OTHER_FURSUIT_COLOR_NORMALIZED_NAME,
    );

    if (selectedOtherColor && !normalizedColorDetails) {
      throw new Error('Add a short color detail so other players know what Other means.');
    }

    const interactionPreferencesError = getInteractionPreferencesError(interactionBadges);
    if (interactionPreferencesError) {
      throw new Error(interactionPreferencesError);
    }

    for (let attempt = 0; attempt < UNIQUE_INSERT_ATTEMPTS; attempt += 1) {
      const uniqueCode = await generateAvailableFursuitCode();

      // Ensure species entry exists in database
      const speciesRecord = await ensureSpeciesEntry(normalizedSpecies);

      const payload: FursuitsInsert & {
        avatar_path?: string | null;
        owner_attribution_visibility?: 'public' | 'hidden';
        visibility_audience?: VisibilityAudience;
      } = {
        owner_id: userId,
        name: normalizedName,
        species_id: speciesRecord.id,
        avatar_path: uploadedStoragePath,
        avatar_url: avatarUrl,
        unique_code: uniqueCode,
        description: normalizedDescription,
        color_details: normalizedColorDetails,
        owner_attribution_visibility: options.hideOwnerPublicly ? 'hidden' : 'public',
        visibility_audience: visibilityAudience,
        social_signal: socialSignal,
        interaction_badges: interactionBadges,
      };

      const { data: inserted, error } = await client
        .from('fursuits')
        .insert(payload)
        .select('id')
        .single();

      if (!error && inserted?.id) {
        const fursuitId = String(inserted.id);

        if (normalizedColorIds.length > 0) {
          const colorAssignments = normalizedColorIds.map((colorId, index) => ({
            fursuit_id: fursuitId,
            color_id: colorId,
            position: index + 1,
          }));

          const { error: colorAssignmentError } = await client
            .from('fursuit_color_assignments')
            .insert(colorAssignments);

          if (colorAssignmentError) {
            const { error: cleanupFursuitError } = await client
              .from('fursuits')
              .delete()
              .eq('id', fursuitId)
              .eq('owner_id', userId);

            if (cleanupFursuitError) {
              captureSupabaseError(cleanupFursuitError, {
                scope: 'onboarding.createQuickFursuit',
                action: 'cleanupFursuitAfterColorFailure',
                userId,
                fursuitId,
              });
            }

            throw colorAssignmentError;
          }
        }

        if (normalizedPhotoCredit) {
          const bioPayload: FursuitBiosInsert = {
            fursuit_id: fursuitId,
            version: 1,
            owner_name: '',
            photo_credit: normalizedPhotoCredit,
            pronouns: '',
            likes_and_interests: '',
            ask_me_about: '',
            social_links: [],
          };

          const { error: bioError } = await client.from('fursuit_bios').insert(bioPayload);

          if (bioError) {
            const { error: cleanupFursuitError } = await client
              .from('fursuits')
              .delete()
              .eq('id', fursuitId)
              .eq('owner_id', userId);

            if (cleanupFursuitError) {
              captureSupabaseError(cleanupFursuitError, {
                scope: 'onboarding.createQuickFursuit',
                action: 'cleanupFursuitAfterBioFailure',
                userId,
                fursuitId,
              });
            }

            throw bioError;
          }
        }

        addMonitoringBreadcrumb({
          category: 'onboarding',
          message: 'Created quick fursuit',
          data: {
            userId,
            fursuitId,
          },
        });
        return fursuitId;
      }

      if (error?.code !== '23505') {
        throw error ?? new Error("We couldn't save that fursuit. Please try again.");
      }
    }

    captureHandledMessage('Ran out of attempts creating quick fursuit', {
      scope: 'onboarding.createQuickFursuit',
      userId,
    });
    throw new Error("We couldn't save that fursuit. Please try again.");
  } catch (caught) {
    if (uploadedStoragePath) {
      const { error: cleanupError } = await supabase.storage
        .from(FURSUIT_BUCKET)
        .remove([uploadedStoragePath]);

      if (cleanupError) {
        captureSupabaseError(cleanupError, {
          scope: 'onboarding.createQuickFursuit',
          action: 'cleanupUpload',
          userId,
          storagePath: uploadedStoragePath,
        });
      }
    }

    throw caught;
  }
}

export async function completeOnboarding(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      onboarding_completed: true,
      is_new: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`We couldn't finish onboarding: ${error.message}`);
  }
}

/**
 * Emit the onboarding_completed event to trigger achievement processing.
 * This is intentionally separate from completeOnboarding() so the caller
 * can control when the event is emitted (e.g., after navigation).
 */
export function emitOnboardingCompletedEvent(userId: string): void {
  // Fire-and-forget: emit event without blocking navigation
  void emitGameplayEvent({
    type: 'onboarding_completed',
    payload: {
      user_id: userId,
      source: 'finish_onboarding',
      achievement_key: GETTING_STARTED_ACHIEVEMENT_KEY,
    },
  });
}
