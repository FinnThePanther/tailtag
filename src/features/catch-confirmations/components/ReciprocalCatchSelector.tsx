import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppAvatar } from '@/components/ui/AppAvatar';
import { TailTagButton } from '@/components/ui/TailTagButton';
import type { ReciprocalFursuitPickerItem } from '@/features/catch-confirmations/api';
import { colors } from '@/theme';
import { styles } from './ReciprocalCatchSelector.styles';

type ReciprocalCatchSelectorProps = {
  items: ReciprocalFursuitPickerItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
  targetName?: string | null;
};

export function ReciprocalCatchSelector({
  items,
  selectedId,
  onSelect,
  disabled = false,
  targetName,
}: ReciprocalCatchSelectorProps) {
  if (items.length === 0) {
    return null;
  }

  const isEnabled = Boolean(selectedId);
  const title = targetName ? `Let ${targetName} catch you back` : 'Let them catch you back';

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons
          name="swap-horizontal-outline"
          size={18}
          color={colors.primary}
        />
        <View style={styles.textBlock}>
          <Text style={styles.label}>{title}</Text>
          <Text style={styles.description}>
            Choose one of your listed suits to offer a back-tag for this catch.
          </Text>
        </View>
        <TailTagButton
          variant={isEnabled ? 'outline' : 'ghost'}
          size="sm"
          onPress={() => onSelect(isEnabled ? null : items[0]?.id)}
          disabled={disabled}
          style={styles.toggleButton}
        >
          {isEnabled ? 'Remove' : 'Offer'}
        </TailTagButton>
      </View>

      {isEnabled ? (
        <View style={styles.suitList}>
          {items.map((item) => {
            const isSelected = item.id === selectedId;
            return (
              <Pressable
                key={item.id}
                onPress={() => onSelect(item.id)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled }}
                accessibilityLabel={`Offer ${item.name} for a back-tag`}
                style={[styles.row, isSelected && styles.rowSelected]}
              >
                <AppAvatar
                  url={item.avatarUrl}
                  size="xs"
                  fallback="fursuit"
                />
                <View style={styles.rowText}>
                  <Text
                    style={styles.rowName}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  {item.species ? (
                    <Text
                      style={styles.rowSpecies}
                      numberOfLines={1}
                    >
                      {item.species}
                    </Text>
                  ) : null}
                </View>
                {isSelected ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={colors.primary}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
