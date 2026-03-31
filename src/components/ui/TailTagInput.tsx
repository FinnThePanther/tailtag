import type { ForwardedRef } from 'react';
import { forwardRef } from 'react';
import type { TextInputProps } from 'react-native';
import { TextInput } from 'react-native';

import { colors } from '../../theme';
import { styles } from './TailTagInput.styles';

type TailTagInputProps = TextInputProps;

function Input(
  { style, ...rest }: TailTagInputProps,
  ref: ForwardedRef<TextInput>
) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.textPlaceholder}
      style={[styles.input, style]}
      {...rest}
    />
  );
}

export const TailTagInput = forwardRef(Input);
