import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { FursuitBio } from "../types";
import { colors, radius, spacing } from "../../../theme";
import { captureNonCriticalError } from "../../../lib/sentry";

const openSocialLink = async (url: string) => {
  try {
    const canOpen = await Linking.canOpenURL(url);

    if (!canOpen) {
      Alert.alert(
        "Link unavailable",
        "We couldn't open that social link on this device.",
      );
      return;
    }

    await Linking.openURL(url);
  } catch (error) {
    captureNonCriticalError(error, {
      scope: "suits.openSocialLink",
      url,
    });
    Alert.alert(
      "Link unavailable",
      "We couldn't open that social link. Try again later.",
    );
  }
};

type FursuitBioDetailsProps = {
  bio: FursuitBio;
};

export function FursuitBioDetails({ bio }: FursuitBioDetailsProps) {
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
  sections: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    color: colors.primary,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 2,
    fontWeight: "600",
  },
  sectionBody: {
    color: "rgba(203,213,225,0.95)",
    fontSize: 14,
    lineHeight: 20,
  },
  socialList: {
    gap: spacing.sm,
  },
  socialLink: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(30,41,59,0.6)",
  },
  socialLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  socialUrl: {
    color: "#38bdf8",
    fontSize: 13,
  },
});
