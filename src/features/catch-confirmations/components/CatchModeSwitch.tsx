import { useCallback, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { colors } from '../../../theme';
import type { CatchMode } from '../types';
import { styles } from './CatchModeSwitch.styles';

type CatchModeSwitchProps = {
  value: CatchMode;
  onChange: (mode: CatchMode) => void | Promise<void>;
  disabled?: boolean;
  scope?: 'fursuit' | 'profile';
};

export function CatchModeSwitch({
  value,
  onChange,
  disabled = false,
  scope = 'fursuit',
}: CatchModeSwitchProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const isAutoCatchingEnabled = value === 'AUTO_ACCEPT';
  const copy =
    scope === 'profile'
      ? {
          label: 'Auto-catching for all suits',
          autoDescription: 'Catches for your suits are recorded instantly without your approval.',
          manualDescription: 'Players must wait for you to approve catches for your suits.',
          accessibilityLabel: 'Auto-catching for all suits',
          autoHint:
            'Currently enabled for all your suits. Toggle to require manual approval for catches.',
          manualHint:
            'Currently disabled for all your suits. Players must wait for approval. Toggle to auto-accept catches.',
        }
      : {
          label: 'Auto-catching',
          autoDescription: 'Catches are recorded instantly without requiring your approval.',
          manualDescription: 'Players must wait for you to approve their catch before it counts.',
          accessibilityLabel: 'Auto-catching',
          autoHint:
            'Currently enabled. Catches are recorded instantly. Toggle to require manual approval.',
          manualHint:
            'Currently disabled. Players must wait for approval. Toggle to auto-accept catches.',
        };

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
        <Text style={styles.label}>{copy.label}</Text>
        <Text style={styles.description}>
          {isAutoCatchingEnabled ? copy.autoDescription : copy.manualDescription}
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
        accessibilityLabel={copy.accessibilityLabel}
        accessibilityHint={isAutoCatchingEnabled ? copy.autoHint : copy.manualHint}
        accessibilityState={{
          checked: isAutoCatchingEnabled,
          disabled: disabled || isUpdating,
        }}
      />
    </View>
  );
}
