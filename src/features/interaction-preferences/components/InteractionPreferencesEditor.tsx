import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme';
import {
  INTERACTION_BADGE_GROUPS,
  MAX_INTERACTION_BADGES,
  SOCIAL_SIGNAL_OPTIONS,
  canToggleInteractionBadge,
  getInteractionBadgeDefinition,
  toggleInteractionBadge,
  type InteractionBadgeKey,
  type SocialSignalKey,
} from '../definitions';
import { styles } from './InteractionPreferences.styles';

type InteractionPreferencesEditorProps = {
  socialSignal: SocialSignalKey | null;
  selectedBadges: InteractionBadgeKey[];
  onSocialSignalChange: (value: SocialSignalKey | null) => void;
  onBadgesChange: (value: InteractionBadgeKey[]) => void;
  disabled?: boolean;
};

export function InteractionPreferencesEditor({
  socialSignal,
  selectedBadges,
  onSocialSignalChange,
  onBadgesChange,
  disabled = false,
}: InteractionPreferencesEditorProps) {
  const selectedBadgeSet = new Set(selectedBadges);

  return (
    <View style={styles.editor}>
      <Text style={styles.introText}>
        Help other players know how to approach this suit at conventions. These are quick signals,
        not blanket permission. People should still ask when unsure.
      </Text>

      <View style={styles.optionGroup}>
        <Text style={styles.optionGroupTitle}>Social signal</Text>
        {SOCIAL_SIGNAL_OPTIONS.map((option) => {
          const selected = socialSignal === option.key;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onSocialSignalChange(selected ? null : option.key)}
              style={({ pressed }) => [
                styles.signalOption,
                selected ? styles.signalOptionSelected : null,
                pressed ? styles.signalOptionPressed : null,
              ]}
            >
              <View
                style={[styles.signalOptionIcon, selected ? styles.signalOptionIconSelected : null]}
              >
                <Ionicons
                  name={option.iconName}
                  size={18}
                  color={selected ? colors.primary : colors.textSubtle}
                />
              </View>
              <View style={styles.signalOptionText}>
                <Text
                  style={[
                    styles.signalOptionLabel,
                    selected ? styles.signalOptionLabelSelected : null,
                  ]}
                >
                  {option.label}
                </Text>
                <Text style={styles.signalOptionDescription}>{option.description}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.optionGroup}>
        <Text style={styles.optionGroupTitle}>Interaction badges</Text>
        <Text style={styles.selectionHint}>
          Pick up to {MAX_INTERACTION_BADGES} badges that help people interact respectfully with
          this suit. Boundary badges are shown first when someone catches you.
        </Text>
        {INTERACTION_BADGE_GROUPS.map((group) => (
          <View
            key={group.category}
            style={styles.badgeGroup}
          >
            <Text style={styles.badgeGroupTitle}>{group.label}</Text>
            <View style={styles.badgeList}>
              {group.badgeKeys.map((badgeKey) => {
                const definition = getInteractionBadgeDefinition(badgeKey);
                const selected = selectedBadgeSet.has(badgeKey);
                const disabledByLimit = !canToggleInteractionBadge(selectedBadges, badgeKey);
                const chipDisabled = disabled || disabledByLimit;

                return (
                  <Pressable
                    key={badgeKey}
                    accessibilityRole="button"
                    accessibilityLabel={definition.label}
                    accessibilityHint={definition.description}
                    accessibilityState={{ selected, disabled: chipDisabled }}
                    disabled={chipDisabled}
                    onPress={() => onBadgesChange(toggleInteractionBadge(selectedBadges, badgeKey))}
                    style={({ pressed }) => [
                      styles.badgeChip,
                      selected ? styles.badgeChipSelected : null,
                      chipDisabled ? styles.badgeChipDisabled : null,
                      pressed ? styles.signalOptionPressed : null,
                    ]}
                  >
                    <Text
                      style={[styles.badgeChipText, selected ? styles.badgeChipTextSelected : null]}
                    >
                      {definition.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
