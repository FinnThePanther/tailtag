import { Switch, Text, View } from 'react-native';

import { colors } from '../../theme';
import { styles } from './FursuitConventionRosterControls.styles';

export type FursuitConventionRosterControlValue = {
  rosterVisible: boolean;
};

type FursuitConventionRosterControlsProps = {
  value: FursuitConventionRosterControlValue;
  disabled?: boolean;
  onChange: (nextValue: FursuitConventionRosterControlValue) => void;
};

export function FursuitConventionRosterControls({
  value,
  disabled = false,
  onChange,
}: FursuitConventionRosterControlsProps) {
  const handleVisibleChange = (rosterVisible: boolean) => {
    onChange({
      rosterVisible,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.textBlock}>
          <Text style={[styles.label, disabled && styles.disabledText]}>Show on roster</Text>
          <Text style={[styles.helper, disabled && styles.disabledText]}>
            Let players see this suit in the convention roster.
          </Text>
        </View>
        <Switch
          value={value.rosterVisible}
          disabled={disabled}
          onValueChange={handleVisibleChange}
          trackColor={{ false: colors.borderDefault, true: colors.primarySurfaceStrong }}
          thumbColor={value.rosterVisible ? colors.primary : 'rgba(203,213,225,0.9)'}
          accessibilityLabel="Show this suit on the convention roster"
        />
      </View>
    </View>
  );
}
