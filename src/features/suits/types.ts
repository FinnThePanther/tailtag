import type { ConventionSummary } from '../conventions';
import type { FursuitColorOption } from '../colors';
import type { FursuitSocialLink } from '../../types/database';

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

export type FursuitSummary = {
  id: string;
  owner_id?: string | null;
  name: string;
  species: string | null;
  speciesId: string | null;
  colors: FursuitColorOption[];
  avatar_path?: string | null;
  avatar_url: string | null;
  description: string | null;
  unique_code: string | null;
  catchCount: number;
  created_at: string | null;
  conventions: ConventionSummary[];
  makers: FursuitMaker[];
  bio: FursuitBio | null;
};

export type FursuitDetail = FursuitSummary & {
  owner_id: string;
};
