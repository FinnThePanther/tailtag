import { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { colors, spacing } from '../../../theme';
import type { CatchMode } from '../types';

type CatchModeSwitchProps = {
  value: CatchMode;
  onChange: (mode: CatchMode) => void | Promise<void>;
  disabled?: boolean;
};

export function CatchModeSwitch({ value, onChange, disabled = false }: CatchModeSwitchProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const isManualApproval = value === 'MANUAL_APPROVAL';

  const handleToggle = useCallback(
    async (newValue: boolean) => {
      if (isUpdating || disabled) {
        return;
      }

      setIsUpdating(true);
      try {
        const newMode: CatchMode = newValue ? 'MANUAL_APPROVAL' : 'AUTO_ACCEPT';
        await onChange(newMode);
      } finally {
        setIsUpdating(false);
      }
    },
    [onChange, isUpdating, disabled]
  );

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text style={styles.label}>Require approval for catches</Text>
        <Text style={styles.description}>
          {isManualApproval
            ? 'Players must wait for you to approve their catch before it counts.'
            : 'Catches are recorded instantly without requiring your approval.'}
        </Text>
      </View>
      <Switch
        value={isManualApproval}
        onValueChange={handleToggle}
        disabled={disabled || isUpdating}
        trackColor={{
          false: 'rgba(148,163,184,0.3)',
          true: colors.primaryDark,
        }}
        thumbColor={isManualApproval ? colors.primary : 'rgba(203,213,225,0.9)'}
        ios_backgroundColor="rgba(148,163,184,0.3)"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  textContainer: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
    lineHeight: 16,
  },
});
