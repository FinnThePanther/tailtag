import { supabase } from '../../../lib/supabase';
import { FURSUIT_BUCKET, MAX_IMAGE_SIZE } from '../../../constants/storage';
import { UNIQUE_CODE_ATTEMPTS, UNIQUE_INSERT_ATTEMPTS } from '../../../constants/codes';
import { generateUniqueCodeCandidate } from '../../../utils/code';
import { loadUriAsUint8Array } from '../../../utils/files';

import type { FursuitsInsert } from '../../../types/database';

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
      throw new Error(`We couldn't generate a tag code right now: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return candidate;
    }
  }

  throw new Error("We couldn't generate a unique tag code. Please try again.");
};

const uploadFursuitPhoto = async (userId: string, photo: FursuitPhotoCandidate) => {
  if (photo.fileSize > MAX_IMAGE_SIZE) {
    throw new Error('Suit photos must be 5MB or smaller.');
  }

  const extension = photo.fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
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
      throw new Error(`We couldn't prepare the tutorial suit: ${insertError?.message ?? 'Unknown error'}`);
    }
  }

  throw new Error("We couldn't prepare the tutorial suit: ran out of attempts.");
};

export async function createQuickFursuit(options: {
  userId: string;
  name: string;
  species: string;
  description: string | null;
  photo: FursuitPhotoCandidate | null;
}): Promise<string> {
  const { userId, name, species, description, photo } = options;
  const client = supabase as any;

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

    if (!normalizedName) {
      throw new Error('Give your fursuit a name before saving.');
    }

    if (!normalizedSpecies) {
      throw new Error('Add a species so other players know who you are.');
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
        return inserted.id;
      }

      if (error?.code !== '23505') {
        throw error ?? new Error("We couldn't save that fursuit. Please try again.");
      }
    }

    throw new Error("We couldn't save that fursuit. Please try again.");
  } catch (caught) {
    if (uploadedStoragePath) {
      const { error: cleanupError } = await supabase.storage
        .from(FURSUIT_BUCKET)
        .remove([uploadedStoragePath]);

      if (cleanupError) {
        console.warn('Failed to clean up onboarding fursuit photo after error', cleanupError);
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
    throw new Error(`We couldn't record your practice catch: ${error.message}`);
  }
}

type FinishOnboardingResult = {
  profile_updated: boolean;
  achievement_unlocked: boolean;
};

export async function completeOnboarding(userId: string): Promise<void> {
  const { data, error } = await supabase.rpc('finish_onboarding', {
    target_user_id: userId,
  });

  if (error) {
    throw new Error(`We couldn't finish onboarding: ${error.message}`);
  }

  const result = (data ?? null) as FinishOnboardingResult | null;

  if (!result || result.profile_updated !== true) {
    throw new Error('We could not confirm your onboarding progress. Please try again.');
  }
}
