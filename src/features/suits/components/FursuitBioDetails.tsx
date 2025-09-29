import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { FursuitBio } from '../types';
import { colors, radius, spacing } from '../../../theme';

const openSocialLink = async (url: string) => {
  try {
    const canOpen = await Linking.canOpenURL(url);

    if (!canOpen) {
      Alert.alert('Link unavailable', "We couldn't open that social link on this device.");
      return;
    }

    await Linking.openURL(url);
  } catch (error) {
    console.warn('Failed to open social link', error);
    Alert.alert('Link unavailable', "We couldn't open that social link. Try again later.");
  }
};

const withFallback = (value: string, fallback: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

type FursuitBioDetailsProps = {
  bio: FursuitBio;
};

export function FursuitBioDetails({ bio }: FursuitBioDetailsProps) {
  const ownerPieces = [bio.ownerName, bio.pronouns]
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const ownerLine = ownerPieces.join(' | ');
  const speciesPieces = [bio.fursuitName, bio.fursuitSpecies]
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const speciesLine = speciesPieces.join(' - ');

  const funFact = withFallback(bio.funFact, 'Fun fact coming soon.');
  const likesAndInterests = withFallback(bio.likesAndInterests, 'Likes coming soon.');
  const askMeAbout = withFallback(bio.askMeAbout, 'Ask me anything!');

  return (
    <View style={styles.container}>
      <View style={styles.headerBlock}>
        {bio.tagline.trim().length > 0 ? (
          <Text style={styles.tagline} numberOfLines={3}>
            {bio.tagline}
          </Text>
        ) : null}
        {ownerLine ? (
          <Text style={styles.ownerLine} numberOfLines={2}>
            {ownerLine}
          </Text>
        ) : null}
        {speciesLine ? (
          <Text style={styles.species} numberOfLines={2}>
            {speciesLine}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Fun fact</Text>
        <Text style={styles.sectionBody}>{funFact}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Likes & interests</Text>
        <Text style={styles.sectionBody}>{likesAndInterests}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Ask me about</Text>
        <Text style={styles.sectionBody}>{askMeAbout}</Text>
      </View>

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
                <Text style={styles.socialUrl} numberOfLines={1}>
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

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(15,23,42,0.6)',
    padding: spacing.md,
    gap: spacing.md,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  tagline: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '600',
  },
  ownerLine: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  species: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    color: colors.primary,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '600',
  },
  sectionBody: {
    color: 'rgba(203,213,225,0.95)',
    fontSize: 14,
    lineHeight: 20,
  },
  socialList: {
    gap: spacing.sm,
  },
  socialLink: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  socialLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  socialUrl: {
    color: '#38bdf8',
    fontSize: 13,
  },
});
