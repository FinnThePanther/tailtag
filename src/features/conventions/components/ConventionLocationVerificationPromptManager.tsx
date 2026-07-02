import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSegments } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import {
  CONVENTIONS_STALE_TIME,
  fetchProfileConventionMemberships,
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
  type ConventionMembership,
} from '@/features/conventions/api/conventions';
import { useConventionVerificationAction } from '@/features/conventions/hooks/useConventionVerificationAction';
import { captureNonCriticalError } from '@/lib/sentry';

const PROMPT_VERSION = 'v1';

const promptStorageKey = (userId: string, membership: ConventionMembership) =>
  `tailtag:conventions:location-check:${PROMPT_VERSION}:${userId}:${membership.convention_id}:${
    membership.local_day ?? 'live'
  }`;

export function ConventionLocationVerificationPromptManager() {
  const { session } = useAuth();
  const segments = useSegments();
  const userId = session?.user.id ?? null;
  const shownPromptKeyRef = useRef<string | null>(null);
  const [dismissedPromptKeys, setDismissedPromptKeys] = useState<Set<string>>(() => new Set());

  const firstSegment = segments[0];
  const secondSegment = segments.at(1);
  const isGatedFlow =
    firstSegment === '(auth)' ||
    firstSegment === 'onboarding' ||
    firstSegment === 'age-gate' ||
    firstSegment === 'legal-consent' ||
    firstSegment === 'reset-password' ||
    (firstSegment === 'auth' && secondSegment === 'callback');

  const membershipsQuery = useQuery({
    queryKey: [PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY, userId],
    queryFn: fetchProfileConventionMemberships,
    enabled: Boolean(userId) && !isGatedFlow,
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const targetMembership = useMemo(
    () =>
      (membershipsQuery.data ?? []).find(
        (membership) => membership.membership_state === 'needs_location_verification',
      ) ?? null,
    [membershipsQuery.data],
  );

  const { verifyConvention, verificationModals, isVerifyingConvention } =
    useConventionVerificationAction({
      profileId: userId,
      onVerified: async () => {
        await membershipsQuery.refetch({ throwOnError: false });
      },
    });

  useEffect(() => {
    shownPromptKeyRef.current = null;
    setDismissedPromptKeys(new Set());
  }, [userId]);

  useEffect(() => {
    if (
      !userId ||
      isGatedFlow ||
      membershipsQuery.isLoading ||
      isVerifyingConvention ||
      !targetMembership
    ) {
      return;
    }

    const key = promptStorageKey(userId, targetMembership);
    if (shownPromptKeyRef.current === key || dismissedPromptKeys.has(key)) {
      return;
    }

    let isActive = true;

    AsyncStorage.getItem(key)
      .then((value) => {
        if (!isActive || value === 'true') {
          return;
        }

        shownPromptKeyRef.current = key;

        const markPromptSeen = () => {
          setDismissedPromptKeys((current) => {
            if (current.has(key)) {
              return current;
            }

            const next = new Set(current);
            next.add(key);
            return next;
          });
          AsyncStorage.setItem(key, 'true').catch((error) => {
            captureNonCriticalError(error, {
              scope: 'conventions.locationVerificationPrompt.save',
              userId,
              conventionId: targetMembership.convention_id,
            });
          });
        };

        Alert.alert(
          `${targetMembership.name} is live`,
          'Verify your location to start catching.',
          [
            {
              text: 'Not now',
              style: 'cancel',
              onPress: markPromptSeen,
            },
            {
              text: 'Verify now',
              onPress: () => {
                markPromptSeen();
                void verifyConvention(targetMembership).catch((error) => {
                  captureNonCriticalError(error, {
                    scope: 'conventions.locationVerificationPrompt.verify',
                    userId,
                    conventionId: targetMembership.convention_id,
                  });
                });
              },
            },
          ],
          { cancelable: false },
        );
      })
      .catch((error) => {
        captureNonCriticalError(error, {
          scope: 'conventions.locationVerificationPrompt.load',
          userId,
          conventionId: targetMembership.convention_id,
        });
      });

    return () => {
      isActive = false;
    };
  }, [
    dismissedPromptKeys,
    isGatedFlow,
    isVerifyingConvention,
    membershipsQuery.isLoading,
    targetMembership,
    userId,
    verifyConvention,
  ]);

  return verificationModals;
}
