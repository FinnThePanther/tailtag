import type { ConventionSummary } from '../conventions';
import type { FursuitColorOption } from '../colors';
import type { FursuitSpeciesOption } from '@/features/species';
import type { FursuitSocialLink } from '../../types/database';
import type { VisibilityAudience } from '@/features/adult-boundary';
import type { InteractionBadgeKey, SocialSignalKey } from '@/features/interaction-preferences';

export type FursuitBio = {
  version: number;
  ownerName: string;
  photoCredit: string;
  pronouns: string;
  likesAndInterests: string;
  askMeAbout: string;
  socialLinks: FursuitSocialLink[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type FursuitMaker = {
  id: string;
  name: string;
  normalizedName: string;
  position: number;
};

export type FursuitConvention = ConventionSummary & {
  roster_visible: boolean;
};

export type FursuitSummary = {
  id: string;
  isRedacted?: boolean;
  owner_id?: string | null;
  name: string;
  species: string | null;
  speciesId: string | null;
  speciesTags: FursuitSpeciesOption[];
  colors: FursuitColorOption[];
  avatar_path?: string | null;
  avatar_url: string | null;
  description: string | null;
  unique_code: string | null;
  visibility_audience: VisibilityAudience;
  ownerAttributionVisibility: 'public' | 'hidden';
  socialSignal: SocialSignalKey | null;
  interactionBadges: InteractionBadgeKey[];
  catchCount: number;
  created_at: string | null;
  conventions: FursuitConvention[];
  makers: FursuitMaker[];
  bio: FursuitBio | null;
};

export type FursuitDetail = FursuitSummary & {
  owner_id: string | null;
};
