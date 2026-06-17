import { Text, View } from 'react-native';

import { colors } from '@/theme';
import {
  getInteractionBadgeDefinition,
  getSocialSignalDefinition,
  hasInteractionPreferences,
  sortInteractionBadges,
  type InteractionBadgeKey,
  type SocialSignalKey,
} from '@/features/interaction-preferences/definitions';
import { styles } from '@/features/interaction-preferences/components/InteractionPreferences.styles';

type InteractionPreferencesSummaryProps = {
  socialSignal: SocialSignalKey | null;
  badges: InteractionBadgeKey[];
  title?: string;
  body?: string;
};

const SIGNAL_DOT_COLORS: Record<string, string> = {
  open: '#22c55e',
  ask: colors.amber,
  closed: colors.destructive,
};

export function InteractionPreferencesSummary({
  socialSignal,
  badges,
  title = 'Interaction preferences',
  body,
}: InteractionPreferencesSummaryProps) {
  const signalDefinition = getSocialSignalDefinition(socialSignal);
  const sortedBadges = sortInteractionBadges(badges);

  if (!hasInteractionPreferences(socialSignal, sortedBadges)) {
    return null;
  }

  return (
    <View style={styles.summary}>
      <Text style={styles.summaryTitle}>{title}</Text>
      {body ? <Text style={styles.summaryBody}>{body}</Text> : null}
      {signalDefinition ? (
        <View style={styles.summarySignal}>
          <View
            style={[
              styles.summarySignalDot,
              { backgroundColor: SIGNAL_DOT_COLORS[signalDefinition.tone] },
            ]}
          />
          <Text style={styles.summarySignalLabel}>{signalDefinition.label}</Text>
        </View>
      ) : null}
      {sortedBadges.length > 0 ? (
        <View style={styles.summaryBadgeList}>
          {sortedBadges.map((badgeKey) => (
            <View
              key={badgeKey}
              style={styles.summaryBadge}
            >
              <Text style={styles.summaryBadgeText}>
                {getInteractionBadgeDefinition(badgeKey).label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
