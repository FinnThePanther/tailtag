import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { TailTagButton } from '@/components/ui/TailTagButton';
import { TailTagCard } from '@/components/ui/TailTagCard';
import type { NearbyConventionSetupReminder } from '@/features/conventions/api/nearbyConventionReminders';
import { styles } from '@/features/conventions/components/NearbyConventionSetupReminderCard.styles';
import { colors } from '@/theme';

type NearbyConventionSetupReminderCardProps = {
  reminder: NearbyConventionSetupReminder;
  onPress: () => void;
  onDismiss: () => void;
  style?: ViewStyle | ViewStyle[];
};

function actionLabel(action: NearbyConventionSetupReminder['action']) {
  switch (action) {
    case 'finish_check_in':
      return 'Finish check-in';
    case 'add_suit':
      return 'Add a suit';
    default:
      return 'Join convention';
  }
}

function actionBody(action: NearbyConventionSetupReminder['action'], conventionName: string) {
  switch (action) {
    case 'finish_check_in':
      return `Finish check-in for ${conventionName} to start catching.`;
    case 'add_suit':
      return `Add a suit to ${conventionName} so others can catch you.`;
    default:
      return `Join ${conventionName} to start catching and add your suits.`;
  }
}

export function NearbyConventionSetupReminderCard({
  reminder,
  onPress,
  onDismiss,
  style,
}: NearbyConventionSetupReminderCardProps) {
  const cardStyle = Array.isArray(style)
    ? [styles.card, ...style]
    : style
      ? [styles.card, style]
      : styles.card;

  return (
    <TailTagCard style={cardStyle}>
      <View style={styles.headerRow}>
        <View style={styles.iconBubble}>
          <Ionicons
            name="location-outline"
            size={18}
            color={colors.primary}
          />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{reminder.conventionName} is live nearby</Text>
          <Text style={styles.body}>{actionBody(reminder.action, reminder.conventionName)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss nearby convention reminder"
          hitSlop={8}
          onPress={onDismiss}
          style={({ pressed }) => [styles.dismissButton, pressed ? styles.pressed : null]}
        >
          <Ionicons
            name="close"
            size={18}
            color={colors.textMuted}
          />
        </Pressable>
      </View>
      <TailTagButton
        size="sm"
        onPress={onPress}
        style={styles.cta}
      >
        {actionLabel(reminder.action)}
      </TailTagButton>
    </TailTagCard>
  );
}
