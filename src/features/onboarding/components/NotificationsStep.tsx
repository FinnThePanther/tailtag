import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { TailTagButton } from "../../../components/ui/TailTagButton";
import { TailTagCard } from "../../../components/ui/TailTagCard";
import {
  markPushNotificationPrompted,
  usePushNotifications,
} from "../../push-notifications";
import { captureNonCriticalError } from "../../../lib/sentry";
import { colors, spacing } from "../../../theme";

type NotificationsStepProps = {
  userId: string;
  onComplete: () => void;
};

export function NotificationsStep({
  userId,
  onComplete,
}: NotificationsStepProps) {
  const { isSupported, requestPermissionAndRegister } = usePushNotifications({
    userId,
  });
  const [isBusy, setIsBusy] = useState(false);

  const markPrompted = () => {
    void markPushNotificationPrompted(userId).catch((error) => {
      captureNonCriticalError(error, {
        scope: "onboarding.notifications.markPrompted",
        userId,
      });
    });
  };

  const handleEnable = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await requestPermissionAndRegister();
    } catch (error) {
      captureNonCriticalError(error, {
        scope: "onboarding.notifications.enable",
        userId,
      });
    } finally {
      markPrompted();
      setIsBusy(false);
      onComplete();
    }
  };

  const handleSkip = () => {
    markPrompted();
    onComplete();
  };

  // If device doesn't support push notifications, skip this step silently
  if (!isSupported) {
    markPrompted();
    onComplete();
    return null;
  }

  return (
    <View style={styles.container}>
      <TailTagCard>
        <Text style={styles.eyebrow}>Step 5</Text>
        <Text style={styles.title}>Stay in the loop</Text>
        <Text style={styles.body}>
          Enable notifications so TailTag can let you know when something
          exciting happens!
        </Text>

        <View style={styles.notificationList}>
          <NotificationItem emoji="🏆" label="You unlock a new achievement" />
          <NotificationItem
            emoji="🎉"
            label="A catch you submitted is confirmed"
          />
          <NotificationItem emoji="✅" label="You complete a daily task" />
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

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  body: {
    color: "rgba(226,232,240,0.85)",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  notificationList: {
    backgroundColor: "rgba(15,23,42,0.65)",
    borderRadius: 18,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  notificationItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  emoji: {
    fontSize: 18,
    width: 28,
    textAlign: "center",
  },
  notificationLabel: {
    color: "rgba(226,232,240,0.85)",
    fontSize: 14,
    flex: 1,
  },
  skipButton: {
    marginTop: spacing.sm,
  },
});
