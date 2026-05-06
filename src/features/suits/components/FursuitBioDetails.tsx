import { Alert, Linking, Pressable, Text, View } from 'react-native';

import type { FursuitBio, FursuitMaker } from '../types';
import { captureNonCriticalError } from '../../../lib/sentry';
import { styles } from './FursuitBioDetails.styles';

/** True when {@link FursuitBioDetails} would render at least one section (excludes owner-only bios). */
export function fursuitBioHasDisplayableContent(
  bio: FursuitBio | null | undefined,
  makers: FursuitMaker[] = [],
): boolean {
  const hasPhotoCredit = Boolean(bio?.photoCredit?.trim());
  const hasPronouns = Boolean(bio?.pronouns?.trim());
  const hasLikesAndInterests = Boolean(bio?.likesAndInterests?.trim());
  const hasAskMeAbout = Boolean(bio?.askMeAbout?.trim());
  const hasLikesSection = hasLikesAndInterests || hasAskMeAbout;
  const hasSocial = (bio?.socialLinks ?? []).length > 0;
  const hasMakers = makers.length > 0;
  return hasPhotoCredit || hasPronouns || hasLikesSection || hasSocial || hasMakers;
}

const openSocialLink = async (url: string) => {
  try {
    const canOpen = await Linking.canOpenURL(url);

    if (!canOpen) {
      Alert.alert('Link unavailable', "We couldn't open that social link on this device.");
      return;
    }

    await Linking.openURL(url);
  } catch (error) {
    captureNonCriticalError(error, {
      scope: 'suits.openSocialLink',
      url,
    });
    Alert.alert('Link unavailable', "We couldn't open that social link. Try again later.");
  }
};

type FursuitBioDetailsProps = {
  bio: FursuitBio | null;
  makers?: FursuitMaker[];
};

export function FursuitBioDetails({ bio, makers = [] }: FursuitBioDetailsProps) {
  if (!fursuitBioHasDisplayableContent(bio, makers)) {
    return null;
  }

  const hasPronouns = Boolean(bio?.pronouns?.trim());
  const hasPhotoCredit = Boolean(bio?.photoCredit?.trim());
  const hasLikesAndInterests = Boolean(bio?.likesAndInterests?.trim());
  const hasAskMeAbout = Boolean(bio?.askMeAbout?.trim());
  const hasLikesSection = hasLikesAndInterests || hasAskMeAbout;
  const socialLinks = bio?.socialLinks ?? [];

  return (
    <View style={styles.sections}>
      {makers.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Fursuit Maker</Text>
          <View style={styles.makerList}>
            {makers.map((maker) => (
              <Text
                key={maker.id}
                style={styles.makerName}
              >
                {maker.name}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {hasPhotoCredit ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Photo credit</Text>
          <Text style={styles.sectionBody}>{bio?.photoCredit.trim()}</Text>
        </View>
      ) : null}

      {hasPronouns ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Pronouns</Text>
          <Text style={styles.sectionBody}>{bio?.pronouns.trim()}</Text>
        </View>
      ) : null}

      {hasLikesSection ? (
        <View style={styles.section}>
          {hasLikesAndInterests ? (
            <>
              <Text style={styles.sectionLabel}>Likes & interests</Text>
              <Text style={styles.sectionBody}>{bio?.likesAndInterests.trim()}</Text>
            </>
          ) : null}
          {hasAskMeAbout ? (
            <>
              <Text style={styles.sectionLabel}>Ask me about…</Text>
              <Text style={styles.sectionBody}>{bio?.askMeAbout.trim()}</Text>
            </>
          ) : null}
        </View>
      ) : null}

      {socialLinks.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Social links</Text>
          <View style={styles.socialList}>
            {socialLinks.map((link) => (
              <Pressable
                key={`${link.label}-${link.url}`}
                style={styles.socialLink}
                onPress={() => openSocialLink(link.url)}
              >
                <Text style={styles.socialLabel}>{link.label}</Text>
                <Text
                  style={styles.socialUrl}
                  numberOfLines={1}
                >
                  {link.url}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
