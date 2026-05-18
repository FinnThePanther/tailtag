import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareFormWrapper } from '../src/components/ui/KeyboardAwareFormWrapper';
import { TailTagButton } from '../src/components/ui/TailTagButton';
import { TailTagCard } from '../src/components/ui/TailTagCard';
import {
  CURRENT_AGE_GATE_VERSION,
  profileNeedsAgeAttestation,
  refreshAdultBoundaryCaches,
  updateAgeAttestation,
} from '../src/features/adult-boundary';
import { useAuth } from '../src/features/auth';
import { createProfileQueryOptions, type ProfileSummary } from '../src/features/profile';
import { colors } from '../src/theme';
import { styles } from '../src/app-styles/age-gate.styles';

const AGE_CHANGE_SUPPORT_URL =
  'mailto:finn@finnthepanther.com?subject=TailTag%20age%20setting%20change%20request&body=Please%20include%20your%20TailTag%20username%20and%20the%20age%20setting%20change%20you%20need%20help%20with.';

function destinationForProfile(profile: ProfileSummary | null | undefined): '/' | '/onboarding' {
  return profile?.onboarding_completed === true && profile?.is_new !== true ? '/' : '/onboarding';
}

export default function AgeGateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [savingChoice, setSavingChoice] = useState<boolean | null>(null);
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

  const handleAttest = useCallback(
    async (isAdult: boolean) => {
      if (!userId || savingChoice !== null) {
        return;
      }

      setSavingChoice(isAdult);
      setError(null);

      try {
        await updateAgeAttestation(userId, isAdult);
        queryClient.setQueryData<ProfileSummary | null>(
          createProfileQueryOptions(userId).queryKey,
          (current) =>
            current
              ? {
                  ...current,
                  is_adult: isAdult,
                  age_gate_version: CURRENT_AGE_GATE_VERSION,
                }
              : current,
        );
        await refreshAdultBoundaryCaches({ queryClient, userId });
        router.replace(destinationForProfile(profile));
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'We could not save your age attestation right now. Please try again.',
        );
      } finally {
        setSavingChoice(null);
      }
    },
    [profile, queryClient, router, savingChoice, userId],
  );

  const handleContactSupport = useCallback(async () => {
    await Linking.openURL(AGE_CHANGE_SUPPORT_URL);
  }, []);

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

  if (!profileNeedsAgeAttestation(profile)) {
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
              name="shield-checkmark-outline"
              size={24}
              color={colors.primary}
            />
          </View>
          <Text style={styles.eyebrow}>Visibility settings</Text>
          <Text style={styles.title}>Confirm your age range</Text>
          <Text style={styles.body}>
            TailTag is open to players under 18. Everyone can catch, join conventions, and play the
            game; some profiles and fursuits are only available to players who confirm they are 18
            or older.
          </Text>
          <Text style={styles.body}>
            Choose carefully. After you confirm, this setting can only be changed by contacting
            support.
          </Text>
          <TailTagButton
            variant="outline"
            onPress={() => void handleContactSupport()}
            disabled={savingChoice !== null}
          >
            Contact Support
          </TailTagButton>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actionGroup}>
            <TailTagButton
              onPress={() => void handleAttest(true)}
              loading={savingChoice === true}
              disabled={savingChoice !== null}
            >
              I am 18 or older
            </TailTagButton>
            <TailTagButton
              variant="outline"
              onPress={() => void handleAttest(false)}
              loading={savingChoice === false}
              disabled={savingChoice !== null}
            >
              I am under 18
            </TailTagButton>
          </View>
        </TailTagCard>
      </KeyboardAwareFormWrapper>
    </SafeAreaView>
  );
}
