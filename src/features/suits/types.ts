import type { ConventionSummary } from '../conventions';
import type { FursuitSocialLink } from '../../types/database';

export type FursuitBio = {
  version: number;
  fursuitName: string;
  fursuitSpecies: string;
  ownerName: string;
  pronouns: string;
  tagline: string;
  funFact: string;
  likesAndInterests: string;
  askMeAbout: string;
  socialLinks: FursuitSocialLink[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type FursuitSummary = {
  id: string;
  name: string;
  species: string | null;
  avatar_url: string | null;
  unique_code: string | null;
  created_at: string | null;
  conventions: ConventionSummary[];
  bio: FursuitBio | null;
};

export type FursuitOwnerProfile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

export type FursuitDetail = FursuitSummary & {
  owner_id: string;
  owner_profile: FursuitOwnerProfile | null;
};
