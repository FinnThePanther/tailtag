import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSegments } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import {
  CONVENTIONS_STALE_TIME,
  fetchProfileConventionMemberships,
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
} from '@/features/conventions';
import { captureNonCriticalError } from '@/lib/sentry';
import { markPushNotificationPrompted } from '../api/pushNotifications';
import { usePushNotifications } from '../hooks/usePushNotifications';

const ANTHROCON_2026_SLUG = 'anthrocon-2026';
const PROMPT_CAMPAIGN_VERSION = 'v1';

const promptStorageKey = (userId: string) =>
  `tailtag:push:${ANTHROCON_2026_SLUG}:preenrolled:${PROMPT_CAMPAIGN_VERSION}:${userId}`;

export function AnthroconNotificationPromptManager() {
  const { session } = useAuth();
  const segments = useSegments();
  const userId = session?.user.id ?? null;
  const hasShownPromptRef = useRef(false);
  const [hasSeenCampaignPrompt, setHasSeenCampaignPrompt] = useState<boolean | null>(null);

  const { isSupported, permissionStatus, isEnabled, isRegistering, requestPermissionAndRegister } =
    usePushNotifications({ userId });

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

  const hasAnthroconMembership = useMemo(
    () =>
      (membershipsQuery.data ?? []).some(
        (membership) =>
          membership.slug === ANTHROCON_2026_SLUG && membership.membership_state !== 'past',
      ),
    [membershipsQuery.data],
  );

  useEffect(() => {
    hasShownPromptRef.current = false;
    setHasSeenCampaignPrompt(null);

    if (!userId) {
      return;
    }

    let isMounted = true;
    AsyncStorage.getItem(promptStorageKey(userId))
      .then((value) => {
        if (isMounted) {
          setHasSeenCampaignPrompt(value === 'true');
        }
      })
      .catch((error) => {
        if (isMounted) {
          setHasSeenCampaignPrompt(false);
        }
        captureNonCriticalError(error, {
          scope: 'push-notifications.anthroconPrompt.load',
          userId,
        });
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (
      !userId ||
      isGatedFlow ||
      !isSupported ||
      isEnabled ||
      isRegistering ||
      hasSeenCampaignPrompt !== false ||
      !hasAnthroconMembership ||
      membershipsQuery.isLoading ||
      hasShownPromptRef.current
    ) {
      return;
    }

    hasShownPromptRef.current = true;

    const markCampaignSeen = () => {
      setHasSeenCampaignPrompt(true);
      AsyncStorage.setItem(promptStorageKey(userId), 'true').catch((error) => {
        captureNonCriticalError(error, {
          scope: 'push-notifications.anthroconPrompt.save',
          userId,
        });
      });
      markPushNotificationPrompted(userId).catch((error) => {
        captureNonCriticalError(error, {
          scope: 'push-notifications.anthroconPrompt.markPrompted',
          userId,
        });
      });
    };

    const enableNotifications = async () => {
      markCampaignSeen();

      if (permissionStatus === 'denied') {
        Alert.alert(
          'Notifications are blocked',
          'Open system settings to allow TailTag notifications for catch approvals and convention updates.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ],
        );
        return;
      }

      await requestPermissionAndRegister();
    };

    Alert.alert(
      'Turn on TailTag notifications?',
      'Anthrocon catches move faster when fursuiters can see approval requests right away.',
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: markCampaignSeen,
        },
        {
          text: permissionStatus === 'denied' ? 'Open Settings' : 'Enable',
          onPress: () => {
            void enableNotifications().catch((error) => {
              captureNonCriticalError(error, {
                scope: 'push-notifications.anthroconPrompt.enable',
                userId,
              });
            });
          },
        },
      ],
      { cancelable: false },
    );
  }, [
    hasAnthroconMembership,
    hasSeenCampaignPrompt,
    isEnabled,
    isGatedFlow,
    isRegistering,
    isSupported,
    membershipsQuery.isLoading,
    permissionStatus,
    requestPermissionAndRegister,
    userId,
  ]);

  return null;
}
