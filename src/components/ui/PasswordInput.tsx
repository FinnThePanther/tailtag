import { forwardRef, useState } from 'react';
import { Pressable, TextInput, TextInputProps, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { colors, spacing } from '../../theme';
import { TailTagInput } from './TailTagInput';

type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry'>;

export const PasswordInput = forwardRef<TextInput, PasswordInputProps>(
  function PasswordInput(props, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <View style={{ position: 'relative' }}>
        <TailTagInput
          {...props}
          ref={ref}
          secureTextEntry={!visible}
          style={{ paddingRight: 48 }}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          style={{
            position: 'absolute',
            right: spacing.md,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
          }}
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          accessibilityRole="button"
        >
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={colors.primary}
          />
        </Pressable>
      </View>
    );
  },
);
