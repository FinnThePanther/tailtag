import type { ConventionSummary } from '../conventions';
import type { FursuitColorOption } from '../colors';
import type { FursuitSocialLink } from '../../types/database';
import type { CatchMode } from '../catch-confirmations';

export type FursuitBio = {
  version: number;
  ownerName: string;
  pronouns: string;
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
  speciesId: string | null;
  colors: FursuitColorOption[];
  avatar_url: string | null;
  description: string | null;
  unique_code: string | null;
  catchCount: number;
  catchMode: CatchMode;
  created_at: string | null;
  conventions: ConventionSummary[];
  bio: FursuitBio | null;
};

export type FursuitDetail = FursuitSummary & {
  owner_id: string;
};
