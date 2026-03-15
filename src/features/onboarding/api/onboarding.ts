import { supabase } from '../../../lib/supabase';
import { FURSUIT_BUCKET, MAX_IMAGE_SIZE } from '../../../constants/storage';
import { UNIQUE_CODE_ATTEMPTS, UNIQUE_INSERT_ATTEMPTS } from '../../../constants/codes';
import { generateUniqueCodeCandidate } from '../../../utils/code';
import { loadUriAsUint8Array } from '../../../utils/files';
import { inferImageExtension } from '../../../utils/images';
import {
  addMonitoringBreadcrumb,
  captureHandledMessage,
  captureSupabaseError,
} from '../../../lib/sentry';
import { emitGameplayEvent } from '../../events';
import { mapLatestFursuitBio, mapFursuitColors } from '../../suits/api/utils';

import type { FursuitsInsert } from '../../../types/database';
import type { FursuitBio } from '../../suits/types';
import type { FursuitColorOption } from '../../colors';
import { MAX_FURSUIT_COLORS } from '../../colors';
import { MAX_FURSUITS_PER_USER } from '../../../constants/fursuits';
import { ensureSpeciesEntry } from '../../species';

const TUTORIAL_FURSUIT_NAME = 'TailTag Trainer';
const TUTORIAL_FURSUIT_SPECIES = 'Fox';
const TUTORIAL_FURSUIT_DESCRIPTION = 'Practice suit used during onboarding';
export const GETTING_STARTED_ACHIEVEMENT_KEY = 'getting_started';

const TUTORIAL_BIO = {
  ownerName: 'TailTag Trainer',
  pronouns: 'they/them',
  likesAndInterests: 'Welcoming new players, teaching the ropes, and high-fives',
  askMeAbout: 'How to find more fursuits at the convention!',
};

const TUTORIAL_COLOR_NAMES = ['Teal', 'White'] as const;

export type TutorialCatchResult = {
  name: string;
  species: string | null;
  uniqueCode: string | null;
  avatarUrl: string | null;
  colors: FursuitColorOption[];
  bio: FursuitBio | null;
};

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
  if (photo.fileSize > MAX_IMAGE_SIZE) {
    throw new Error('Suit photos must be 5MB or smaller.');
  }

  const extension = inferImageExtension(photo);
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `${userId}/${uniqueSuffix}.${extension}`;

  const fileBytes = await loadUriAsUint8Array(photo.uri);

  const { error: uploadError } = await supabase.storage.from(FURSUIT_BUCKET).upload(storagePath, fileBytes, {
    contentType: photo.mimeType,
    upsert: true,
  });

  if (uploadError) {
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
    throw new Error(`We couldn't look up the tutorial suit: ${fetchError.message}`);
  }

  if (existing?.id) {
    return existing.id as string;
  }

  // Tutorial fursuits always use "TEST" as their code.
  // The unique constraint only applies to non-tutorial fursuits (partial index),
  // so multiple users can each have a tutorial fursuit with this code.
  const tutorialSpeciesRecord = await ensureSpeciesEntry(TUTORIAL_FURSUIT_SPECIES);

  const { data: inserted, error: insertError } = await client
    .from('fursuits')
    .insert({
      owner_id: userId,
      name: TUTORIAL_FURSUIT_NAME,
      species_id: tutorialSpeciesRecord.id,
      avatar_url: null,
      unique_code: 'TEST',
      description: TUTORIAL_FURSUIT_DESCRIPTION,
      is_tutorial: true,
    })
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`We couldn't prepare the tutorial suit: ${insertError.message}`);
  }

  if (inserted?.id) {
    const fursuitId = inserted.id as string;

    // Add bio for the tutorial fursuit
    const { error: bioError } = await client
      .from('fursuit_bios')
      .insert({
        fursuit_id: fursuitId,
        version: 1,
        owner_name: TUTORIAL_BIO.ownerName,
        pronouns: TUTORIAL_BIO.pronouns,
        likes_and_interests: TUTORIAL_BIO.likesAndInterests,
        ask_me_about: TUTORIAL_BIO.askMeAbout,
        social_links: [],
      });

    if (bioError) {
      captureSupabaseError(bioError, {
        scope: 'onboarding.ensureTutorialFursuit',
        action: 'insertBio',
        userId,
        fursuitId,
      });
    }

    // Add colors for the tutorial fursuit
    const { data: colorRows } = await client
      .from('fursuit_colors')
      .select('id, name')
      .in('name', TUTORIAL_COLOR_NAMES);

    if (colorRows && colorRows.length > 0) {
      const colorAssignments = colorRows.map(
        (row: { id: string; name: string }, index: number) => ({
          fursuit_id: fursuitId,
          color_id: row.id,
          position: index + 1,
        }),
      );

      const { error: colorError } = await client
        .from('fursuit_color_assignments')
        .insert(colorAssignments);

      if (colorError) {
        captureSupabaseError(colorError, {
          scope: 'onboarding.ensureTutorialFursuit',
          action: 'insertColors',
          userId,
          fursuitId,
        });
      }
    }

    return fursuitId;
  }

  throw new Error("We couldn't prepare the tutorial suit: insert returned no data.");
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

      // Ensure species entry exists in database
      const speciesRecord = await ensureSpeciesEntry(normalizedSpecies);

      const payload: FursuitsInsert = {
        owner_id: userId,
        name: normalizedName,
        species_id: speciesRecord.id,
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

export async function recordTutorialCatch(userId: string): Promise<TutorialCatchResult> {
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
    throw new Error(`We couldn't record your practice catch: ${error.message}`);
  }

  // Fetch the tutorial fursuit details for the result screen
  const { data: fursuit, error: fetchError } = await client
    .from('fursuits')
    .select(`
      name,
      avatar_url,
      unique_code,
      fursuit_species ( name ),
      fursuit_color_assignments ( position, color:fursuit_colors ( id, name, normalized_name ) ),
      fursuit_bios ( version, owner_name, pronouns, likes_and_interests, ask_me_about, social_links, created_at, updated_at )
    `)
    .eq('id', tutorialFursuitId)
    .single();

  if (fetchError) {
    throw new Error(`We couldn't load the tutorial suit details: ${fetchError.message}`);
  }

  const species =
    fursuit.fursuit_species && typeof fursuit.fursuit_species === 'object'
      ? (fursuit.fursuit_species as { name?: string }).name ?? null
      : null;

  return {
    name: fursuit.name,
    species,
    uniqueCode: fursuit.unique_code,
    avatarUrl: fursuit.avatar_url,
    colors: mapFursuitColors(fursuit.fursuit_color_assignments),
    bio: mapLatestFursuitBio(fursuit.fursuit_bios),
  };
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
