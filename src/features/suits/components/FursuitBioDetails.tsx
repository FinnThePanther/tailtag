import { Alert, Linking, Pressable, Text, View } from 'react-native';

import type { FursuitBio } from '../types';
import { captureNonCriticalError } from '../../../lib/sentry';
import { styles } from './FursuitBioDetails.styles';

/** True when {@link FursuitBioDetails} would render at least one section (excludes owner-only bios). */
export function fursuitBioHasDisplayableContent(bio: FursuitBio): boolean {
  const hasPronouns = Boolean(bio.pronouns?.trim());
  const hasLikesAndInterests = Boolean(bio.likesAndInterests?.trim());
  const hasAskMeAbout = Boolean(bio.askMeAbout?.trim());
  const hasLikesSection = hasLikesAndInterests || hasAskMeAbout;
  const hasSocial = bio.socialLinks.length > 0;
  return hasPronouns || hasLikesSection || hasSocial;
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
  bio: FursuitBio;
};

export function FursuitBioDetails({ bio }: FursuitBioDetailsProps) {
  if (!fursuitBioHasDisplayableContent(bio)) {
    return null;
  }

  const hasPronouns = Boolean(bio.pronouns?.trim());
  const hasLikesAndInterests = Boolean(bio.likesAndInterests?.trim());
  const hasAskMeAbout = Boolean(bio.askMeAbout?.trim());
  const hasLikesSection = hasLikesAndInterests || hasAskMeAbout;

  return (
    <View style={styles.sections}>
      {hasPronouns ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Pronouns</Text>
          <Text style={styles.sectionBody}>{bio.pronouns!.trim()}</Text>
        </View>
      ) : null}

      {hasLikesSection ? (
        <View style={styles.section}>
          {hasLikesAndInterests ? (
            <>
              <Text style={styles.sectionLabel}>Likes & interests</Text>
              <Text style={styles.sectionBody}>{bio.likesAndInterests!.trim()}</Text>
            </>
          ) : null}
          {hasAskMeAbout ? (
            <>
              <Text style={styles.sectionLabel}>Ask me about…</Text>
              <Text style={styles.sectionBody}>{bio.askMeAbout!.trim()}</Text>
            </>
          ) : null}
        </View>
      ) : null}

      {bio.socialLinks.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Social links</Text>
          <View style={styles.socialList}>
            {bio.socialLinks.map((link) => (
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
