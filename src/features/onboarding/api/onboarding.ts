import { supabase } from '../../../lib/supabase';
import { FURSUIT_BUCKET, MAX_IMAGE_SIZE } from '../../../constants/storage';
import { UNIQUE_CODE_ATTEMPTS, UNIQUE_INSERT_ATTEMPTS } from '../../../constants/codes';
import { generateUniqueCodeCandidate } from '../../../utils/code';
import { loadUriAsUint8Array } from '../../../utils/files';
import {
  addMonitoringBreadcrumb,
  captureHandledException,
  captureHandledMessage,
  captureSupabaseError,
} from '../../../lib/sentry';
import { emitGameplayEvent } from '../../events';
import { ensureQrBackupForFursuit } from '../../nfc';

import type { FursuitsInsert } from '../../../types/database';
import { MAX_FURSUIT_COLORS } from '../../colors';
import { MAX_FURSUITS_PER_USER } from '../../../constants/fursuits';

const TUTORIAL_FURSUIT_NAME = 'TailTag Trainer';
const TUTORIAL_FURSUIT_SPECIES = 'Fox';
const TUTORIAL_FURSUIT_DESCRIPTION = 'Practice suit used during onboarding';
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
      .eq('unique_code', candidate)
      .limit(1);

    if (error) {
      captureSupabaseError(error, {
        scope: 'onboarding.generateAvailableFursuitCode',
        action: 'checkCandidate',
        attempt,
        candidate,
      });
      throw new Error(`We couldn't generate a tag code right now: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return candidate;
    }
  }

  captureHandledMessage("Ran out of attempts while generating unique fursuit code", {
    scope: 'onboarding.generateAvailableFursuitCode',
  });
  throw new Error("We couldn't generate a unique tag code. Please try again.");
};

const uploadFursuitPhoto = async (userId: string, photo: FursuitPhotoCandidate) => {
  if (photo.fileSize > MAX_IMAGE_SIZE) {
    throw new Error('Suit photos must be 5MB or smaller.');
  }

  const extension = photo.fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `${userId}/${uniqueSuffix}.${extension}`;

  let fileBytes: Uint8Array;

  try {
    fileBytes = await loadUriAsUint8Array(photo.uri);
  } catch (error) {
    captureHandledException(error, {
      scope: 'onboarding.uploadFursuitPhoto',
      action: 'readFile',
      userId,
      mimeType: photo.mimeType,
    });
    throw error;
  }

  const { error: uploadError } = await supabase.storage.from(FURSUIT_BUCKET).upload(storagePath, fileBytes, {
    contentType: photo.mimeType,
    upsert: true,
  });

  if (uploadError) {
    captureSupabaseError(uploadError, {
      scope: 'onboarding.uploadFursuitPhoto',
      action: 'upload',
      userId,
      storagePath,
    });
    throw uploadError;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(FURSUIT_BUCKET).getPublicUrl(storagePath);

  return { storagePath, publicUrl };
};

const ensureTutorialFursuitForUser = async (userId: string) => {
  const client = supabase as any;
  const { data: existing, error: fetchError } = await client
    .from('fursuits')
    .select('id')
    .eq('owner_id', userId)
    .eq('is_tutorial', true)
    .maybeSingle();

  if (fetchError) {
    captureSupabaseError(fetchError, {
      scope: 'onboarding.ensureTutorialFursuit',
      action: 'lookupExisting',
      userId,
    });
    throw new Error(`We couldn't look up the tutorial suit: ${fetchError.message}`);
  }

  if (existing?.id) {
    return existing.id as string;
  }

  for (let attempt = 0; attempt < UNIQUE_INSERT_ATTEMPTS; attempt += 1) {
    const tutorialCode = await generateAvailableFursuitCode();
    const { data: inserted, error: insertError } = await client
      .from('fursuits')
      .insert({
        owner_id: userId,
        name: TUTORIAL_FURSUIT_NAME,
        species: TUTORIAL_FURSUIT_SPECIES,
        species_id: null,
        avatar_url: null,
        unique_code: tutorialCode,
        description: TUTORIAL_FURSUIT_DESCRIPTION,
        is_tutorial: true,
      })
      .select('id')
      .single();

    if (!insertError && inserted?.id) {
      return inserted.id as string;
    }

    if (insertError?.code !== '23505') {
      captureSupabaseError(insertError, {
        scope: 'onboarding.ensureTutorialFursuit',
        action: 'insertTutorial',
        attempt,
        userId,
      });
      throw new Error(`We couldn't prepare the tutorial suit: ${insertError?.message ?? 'Unknown error'}`);
    }
  }

  captureHandledMessage('Ran out of attempts while preparing tutorial fursuit', {
    scope: 'onboarding.ensureTutorialFursuit',
    userId,
  });
  throw new Error("We couldn't prepare the tutorial suit: ran out of attempts.");
};

export async function createQuickFursuit(options: {
  userId: string;
  name: string;
  species: string;
  description: string | null;
  photo: FursuitPhotoCandidate | null;
  colorIds: string[];
}): Promise<string> {
  const { userId, name, species, description, photo, colorIds } = options;
  const client = supabase as any;

  // Check fursuit count limit
  const { count, error: countError } = await client
    .from('fursuits')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .eq('is_tutorial', false);

  if (countError) {
    captureSupabaseError(countError, {
      scope: 'onboarding.createQuickFursuit',
      action: 'countExisting',
      userId,
    });
    throw new Error(`We couldn't verify your fursuit count: ${countError.message}`);
  }

  if ((count ?? 0) >= MAX_FURSUITS_PER_USER) {
    throw new Error(`You can only have ${MAX_FURSUITS_PER_USER} fursuits.`);
  }

  let uploadedStoragePath: string | null = null;
  let avatarUrl: string | null = null;

  try {
    if (photo) {
      const uploaded = await uploadFursuitPhoto(userId, photo);
      uploadedStoragePath = uploaded.storagePath;
      avatarUrl = uploaded.publicUrl;
    }

    const normalizedName = name.trim();
    const normalizedSpecies = species.trim();
    const normalizedDescription = description?.trim() ?? null;
    const normalizedColorIds = Array.from(
      new Set(
        (Array.isArray(colorIds) ? colorIds : [])
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value.length > 0)
      )
    );

    if (!normalizedName) {
      throw new Error('Give your fursuit a name before saving.');
    }

    if (!normalizedSpecies) {
      throw new Error('Add a species so other players know who you are.');
    }

    if (normalizedColorIds.length === 0) {
      throw new Error('Pick at least one color before saving your fursuit.');
    }

    if (normalizedColorIds.length > MAX_FURSUIT_COLORS) {
      throw new Error('You can choose up to three colors.');
    }

    for (let attempt = 0; attempt < UNIQUE_INSERT_ATTEMPTS; attempt += 1) {
      const uniqueCode = await generateAvailableFursuitCode();
      const payload: FursuitsInsert = {
        owner_id: userId,
        name: normalizedName,
        species: normalizedSpecies,
        species_id: null,
        avatar_url: avatarUrl,
        unique_code: uniqueCode,
        description: normalizedDescription,
        is_tutorial: false,
      };

      const { data: inserted, error } = await client.from('fursuits').insert(payload).select('id').single();

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

        try {
          await ensureQrBackupForFursuit(fursuitId);
        } catch (error) {
          captureHandledException(error, {
            scope: 'onboarding.createQuickFursuit.ensureQrBackup',
            userId,
            fursuitId,
          });
          throw error instanceof Error
            ? error
            : new Error('We could not prepare your QR backup. Please try again.');
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
        captureSupabaseError(error, {
          scope: 'onboarding.createQuickFursuit',
          action: 'insertFursuit',
          userId,
          attempt,
        });
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

export async function recordTutorialCatch(userId: string): Promise<void> {
  const client = supabase as any;
  const tutorialFursuitId = await ensureTutorialFursuitForUser(userId);
  const { error } = await client
    .from('catches')
    .insert({
      catcher_id: userId,
      fursuit_id: tutorialFursuitId,
      caught_at: new Date().toISOString(),
      is_tutorial: true,
    })
    .select('id')
    .maybeSingle();

  if (error && error.code !== '23505') {
    captureSupabaseError(error, {
      scope: 'onboarding.recordTutorialCatch',
      action: 'insertCatch',
      userId,
      tutorialFursuitId,
    });
    throw new Error(`We couldn't record your practice catch: ${error.message}`);
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
    captureSupabaseError(error, {
      scope: 'onboarding.completeOnboarding',
      action: 'updateProfile',
      userId,
    });
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
  emitGameplayEvent({
    type: 'onboarding_completed',
    payload: {
      user_id: userId,
      source: 'finish_onboarding',
      achievement_key: GETTING_STARTED_ACHIEVEMENT_KEY,
    },
  }).catch((error) => {
    captureHandledException(error, {
      scope: 'onboarding.emitOnboardingCompletedEvent',
      userId,
    });
  });
}
