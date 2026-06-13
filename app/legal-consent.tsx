import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareFormWrapper } from '../src/components/ui/KeyboardAwareFormWrapper';
import { TailTagButton } from '../src/components/ui/TailTagButton';
import { TailTagCard } from '../src/components/ui/TailTagCard';
import { profileNeedsAgeAttestation } from '../src/features/adult-boundary';
import { useAuth } from '../src/features/auth';
import { createProfileQueryOptions, type ProfileSummary } from '../src/features/profile';
import {
  profileNeedsLegalConsent,
  updateLegalTermsAcceptance,
} from '../src/features/legal-consent';
import { getUserVisibleErrorMessage } from '../src/lib/userVisibleErrors';
import { colors } from '../src/theme';
import { styles } from '../src/app-styles/legal-consent.styles';

const TERMS_URL = 'https://playtailtag.com/terms';
const PRIVACY_URL = 'https://playtailtag.com/privacy';
const CHILD_SAFETY_URL = 'https://playtailtag.com/child-safety';

function destinationForProfile(
  profile: ProfileSummary | null | undefined,
): '/' | '/onboarding' | '/age-gate' {
  if (profileNeedsAgeAttestation(profile)) {
    return '/age-gate';
  }

  return profile?.onboarding_completed === true && profile?.is_new !== true ? '/' : '/onboarding';
}

export default function LegalConsentScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [accepted, setAccepted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profileQueryOptions = useMemo(
    () => (userId ? createProfileQueryOptions(userId) : null),
    [userId],
  );

  const {
    data: profile = null,
    isLoading,
    isFetching,
  } = useQuery<ProfileSummary | null, Error>({
    ...(profileQueryOptions ?? {
      queryKey: ['profile', 'guest'],
      queryFn: async () => null,
    }),
    enabled: Boolean(userId),
  });

  const openUrl = useCallback(async (url: string) => {
    await Linking.openURL(url);
  }, []);

  const handleAccept = useCallback(async () => {
    if (!userId || !accepted || isSaving) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await updateLegalTermsAcceptance(userId);
      queryClient.setQueryData<ProfileSummary | null>(
        createProfileQueryOptions(userId).queryKey,
        (current) =>
          current
            ? {
                ...current,
                legal_terms_accepted_at: result.acceptedAt,
                legal_terms_version: result.version,
              }
            : current,
      );
      router.replace(destinationForProfile(profile));
    } catch (caught) {
      setError(
        getUserVisibleErrorMessage(
          caught,
          'We could not save your acceptance right now. Please try again.',
        ),
      );
    } finally {
      setIsSaving(false);
    }
  }, [accepted, isSaving, profile, queryClient, router, userId]);

  if (!userId || isLoading || (isFetching && !profile)) {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={['top', 'bottom']}
      >
        <View style={styles.container}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!profileNeedsLegalConsent(profile)) {
    return <Redirect href={destinationForProfile(profile)} />;
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'bottom']}
    >
      <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
        <TailTagCard style={styles.card}>
          <View style={styles.icon}>
            <Ionicons
              name="document-text-outline"
              size={24}
              color={colors.primary}
            />
          </View>
          <Text style={styles.eyebrow}>Community rules</Text>
          <Text style={styles.title}>Review TailTag's policies</Text>
          <Text style={styles.body}>
            TailTag includes user-created profiles, fursuits, photos, and report text. Adult,
            sexual, pornographic, dating, matchmaking, hookup, harassment, bullying, grooming, CSAM,
            CSAE, and illegal content or conduct are not allowed.
          </Text>
          <Text style={styles.body}>
            TailTag is for users 13 and older. 18+ visibility only limits who can view a profile or
            fursuit; it does not allow adult or sexual content. If you are under 13, you cannot use
            TailTag.
          </Text>
          <View style={styles.linkGroup}>
            <TailTagButton
              variant="outline"
              onPress={() => void openUrl(TERMS_URL)}
            >
              Terms
            </TailTagButton>
            <TailTagButton
              variant="outline"
              onPress={() => void openUrl(PRIVACY_URL)}
            >
              Privacy
            </TailTagButton>
            <TailTagButton
              variant="outline"
              onPress={() => void openUrl(CHILD_SAFETY_URL)}
            >
              Child Safety
            </TailTagButton>
          </View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            onPress={() => setAccepted((current) => !current)}
            style={({ pressed }) => [styles.checkboxRow, pressed && styles.checkboxRowPressed]}
          >
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
              {accepted ? (
                <Ionicons
                  name="checkmark"
                  size={18}
                  color="#0f172a"
                />
              ) : null}
            </View>
            <Text style={styles.checkboxLabel}>
              I confirm I am at least 13 years old and agree to TailTag's Terms, Privacy Policy, and
              Child Safety Standards.
            </Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TailTagButton
            onPress={() => void handleAccept()}
            loading={isSaving}
            disabled={!accepted || isSaving}
          >
            Accept and continue
          </TailTagButton>
        </TailTagCard>
      </KeyboardAwareFormWrapper>
    </SafeAreaView>
  );
}
