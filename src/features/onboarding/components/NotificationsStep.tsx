import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { markPushNotificationPrompted, usePushNotifications } from '../../push-notifications';
import { captureNonCriticalError } from '../../../lib/sentry';
import { styles } from './NotificationsStep.styles';

type NotificationsStepProps = {
  userId: string;
  onComplete: (enabled: boolean) => void;
};

export function NotificationsStep({ userId, onComplete }: NotificationsStepProps) {
  const { isSupported, requestPermissionAndRegister } = usePushNotifications({
    userId,
  });
  const [isBusy, setIsBusy] = useState(false);

  const markPrompted = () => {
    void markPushNotificationPrompted(userId).catch((error) => {
      captureNonCriticalError(error, {
        scope: 'onboarding.notifications.markPrompted',
        userId,
      });
    });
  };

  const handleEnable = async () => {
    if (isBusy) return;
    setIsBusy(true);
    let enabled = false;
    try {
      const result = await requestPermissionAndRegister();
      enabled = result !== false;
    } catch (error) {
      captureNonCriticalError(error, {
        scope: 'onboarding.notifications.enable',
        userId,
      });
    } finally {
      markPrompted();
      setIsBusy(false);
      onComplete(enabled);
    }
  };

  const handleSkip = () => {
    markPrompted();
    onComplete(false);
  };

  // If device doesn't support push notifications, show a brief message then advance
  useEffect(() => {
    if (isSupported) return;

    markPrompted();
    const timer = setTimeout(() => onComplete(false), 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported]);

  if (!isSupported) {
    return (
      <View style={styles.container}>
        <TailTagCard>
          <Text style={styles.eyebrow}>Step 4</Text>
          <Text style={styles.title}>Notifications unavailable</Text>
          <View style={styles.unsupportedRow}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color="rgba(148,163,184,0.7)"
            />
            <Text style={styles.body}>
              Push notifications aren't supported on this device. You can still use TailTag — you
              just won't receive live alerts.
            </Text>
          </View>
        </TailTagCard>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TailTagCard>
        <Text style={styles.eyebrow}>Step 4</Text>
        <Text style={styles.title}>Stay in the loop</Text>
        <Text style={styles.body}>
          Enable notifications so TailTag can let you know when something exciting happens!
        </Text>

        <View style={styles.notificationList}>
          <NotificationItem
            emoji="🏆"
            label="You unlock a new achievement"
          />
          <NotificationItem
            emoji="🎉"
            label="A catch you submitted is confirmed"
          />
          <NotificationItem
            emoji="✅"
            label="You complete a daily task"
          />
        </View>

        <TailTagButton
          onPress={handleEnable}
          loading={isBusy}
          disabled={isBusy}
        >
          Enable Notifications
        </TailTagButton>

        <TailTagButton
          variant="outline"
          onPress={handleSkip}
          disabled={isBusy}
          style={styles.skipButton}
        >
          Not now
        </TailTagButton>
      </TailTagCard>
    </View>
  );
}

function NotificationItem({ emoji, label }: { emoji: string; label: string }) {
  return (
    <View style={styles.notificationItem}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.notificationLabel}>{label}</Text>
    </View>
  );
}
