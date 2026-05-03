import { useCallback, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { colors } from '../../../theme';
import type { CatchMode } from '../types';
import { styles } from './CatchModeSwitch.styles';

type CatchModeSwitchProps = {
  value: CatchMode;
  onChange: (mode: CatchMode) => void | Promise<void>;
  disabled?: boolean;
};

export function CatchModeSwitch({ value, onChange, disabled = false }: CatchModeSwitchProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const isAutoCatchingEnabled = value === 'AUTO_ACCEPT';

  const handleToggle = useCallback(
    async (newValue: boolean) => {
      if (isUpdating || disabled) {
        return;
      }

      setIsUpdating(true);
      try {
        const newMode: CatchMode = newValue ? 'AUTO_ACCEPT' : 'MANUAL_APPROVAL';
        await onChange(newMode);
      } finally {
        setIsUpdating(false);
      }
    },
    [onChange, isUpdating, disabled],
  );

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text style={styles.label}>Auto-catching</Text>
        <Text style={styles.description}>
          {isAutoCatchingEnabled
            ? 'Catches are recorded instantly without requiring your approval.'
            : 'Players must wait for you to approve their catch before it counts.'}
        </Text>
      </View>
      <Switch
        value={isAutoCatchingEnabled}
        onValueChange={handleToggle}
        disabled={disabled || isUpdating}
        trackColor={{
          false: 'rgba(148,163,184,0.3)',
          true: colors.primaryDark,
        }}
        thumbColor={isAutoCatchingEnabled ? colors.primary : 'rgba(203,213,225,0.9)'}
        ios_backgroundColor="rgba(148,163,184,0.3)"
        accessibilityRole="switch"
        accessibilityLabel="Auto-catching"
        accessibilityHint={
          isAutoCatchingEnabled
            ? 'Currently enabled. Catches are recorded instantly. Toggle to require manual approval.'
            : 'Currently disabled. Players must wait for approval. Toggle to auto-accept catches.'
        }
        accessibilityState={{
          checked: isAutoCatchingEnabled,
          disabled: disabled || isUpdating,
        }}
      />
    </View>
  );
}
