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

import type { FursuitsInsert } from '../../../types/database';
import { MAX_FURSUIT_COLORS } from '../../colors';
import { MAX_FURSUITS_PER_USER } from '../../../constants/fursuits';
import { ensureSpeciesEntry } from '../../species';

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
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `${userId}/${uniqueSuffix}.jpg`;

  const fileBytes = await loadUriAsUint8Array(photo.uri);

  const { error: uploadError } = await supabase.storage.from(FURSUIT_BUCKET).upload(storagePath, fileBytes, {
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
      avatarUrl = uploaded.avatarUrl;
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

      // Ensure species entry exists in database
      const speciesRecord = await ensureSpeciesEntry(normalizedSpecies);

      const payload: FursuitsInsert & { avatar_path?: string | null } = {
        owner_id: userId,
        name: normalizedName,
        species_id: speciesRecord.id,
        avatar_path: uploadedStoragePath,
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
