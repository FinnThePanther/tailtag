import { supabase } from '../../../lib/supabase';

type InsertNextFursuitBioVersionInput = {
  fursuitId: string;
  ownerName: string;
  photoCredit: string;
  pronouns: string;
  likesAndInterests: string;
  askMeAbout: string;
};

export async function insertNextFursuitBioVersion({
  fursuitId,
  ownerName,
  photoCredit,
  pronouns,
  likesAndInterests,
  askMeAbout,
}: InsertNextFursuitBioVersionInput): Promise<number> {
  const { data, error } = await (supabase as any).rpc('insert_next_fursuit_bio_version', {
    p_fursuit_id: fursuitId,
    p_owner_name: ownerName,
    p_photo_credit: photoCredit,
    p_pronouns: pronouns,
    p_likes_and_interests: likesAndInterests,
    p_ask_me_about: askMeAbout,
    p_social_links: [],
  });

  if (error) {
    throw error;
  }

  const version = Number(data);
  return Number.isFinite(version) ? version : 0;
}
