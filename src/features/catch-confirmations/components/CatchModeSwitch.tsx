import { useCallback, useState } from 'react';
import { Switch, Text, View } from 'react-native';

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
          description:
            'Turn on to record catch code and in-app camera catches instantly. Turn off to review and approve those catches before they count. Gallery photo catches always require approval.',
          accessibilityLabel: 'Auto-catching for all suits',
          accessibilityHint:
            'Controls whether catch code and in-app camera catches count instantly or require your approval.',
        }
      : {
          label: 'Auto-catching',
          description:
            'Turn on to record catch code and in-app camera catches instantly. Turn off to review and approve those catches before they count. Gallery photo catches always require approval.',
          accessibilityLabel: 'Auto-catching',
          accessibilityHint:
            'Controls whether catch code and in-app camera catches count instantly or require your approval.',
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
        <Text style={styles.description}>{copy.description}</Text>
      </View>
      <Switch
        value={isAutoCatchingEnabled}
        onValueChange={handleToggle}
        disabled={disabled || isUpdating}
        accessibilityRole="switch"
        accessibilityLabel={copy.accessibilityLabel}
        accessibilityHint={copy.accessibilityHint}
        accessibilityState={{
          checked: isAutoCatchingEnabled,
          disabled: disabled || isUpdating,
        }}
      />
    </View>
  );
}
