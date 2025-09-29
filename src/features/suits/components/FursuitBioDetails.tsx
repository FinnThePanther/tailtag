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

const buildSuitLines = (name: string, species: string) => {
  const suitName = withFallback(name, 'Name coming soon.');
  const suitSpecies = withFallback(species, 'Species coming soon.');

  return { suitName, suitSpecies };
};

const buildOwnerLines = (owner: string, pronouns: string) => {
  const ownerName = withFallback(owner, 'Owner name coming soon.');
  const pronounLine = withFallback(pronouns, 'Pronouns coming soon.');

  return { ownerName, pronounLine };
};

export function FursuitBioDetails({ bio }: FursuitBioDetailsProps) {
  const tagline = withFallback(bio.tagline, 'Tagline coming soon.');
  const { suitName, suitSpecies } = buildSuitLines(bio.fursuitName, bio.fursuitSpecies);
  const { ownerName, pronounLine } = buildOwnerLines(bio.ownerName, bio.pronouns);
  const funFact = withFallback(bio.funFact, 'Fun fact coming soon.');
  const likesAndInterests = withFallback(bio.likesAndInterests, 'Likes coming soon.');
  const askMeAbout = withFallback(bio.askMeAbout, 'Ask me anything!');

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Tagline</Text>
        <Text style={styles.sectionBody}>{tagline}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Suit</Text>
        <View style={styles.sectionDetail}>
          <Text style={styles.sectionBody}>{suitName}</Text>
          <Text style={styles.sectionMeta}>{suitSpecies}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Owner & pronouns</Text>
        <View style={styles.sectionDetail}>
          <Text style={styles.sectionBody}>{ownerName}</Text>
          <Text style={styles.sectionMeta}>{pronounLine}</Text>
        </View>
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
  sectionDetail: {
    gap: 2,
  },
  sectionMeta: {
    color: 'rgba(148,163,184,0.85)',
    fontSize: 13,
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
