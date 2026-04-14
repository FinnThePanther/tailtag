import type { ForwardedRef } from 'react';
import { forwardRef } from 'react';
import type { TextInputProps } from 'react-native';
import { TextInput } from 'react-native';

import { colors } from '../../theme';
import { styles } from './TailTagInput.styles';

type TailTagInputProps = TextInputProps;

function Input(
  { style, placeholderTextColor, ...rest }: TailTagInputProps,
  ref: ForwardedRef<TextInput>,
) {
  return (
    <TextInput
      ref={ref}
      style={[styles.input, style]}
      {...rest}
      placeholderTextColor={placeholderTextColor ?? colors.textPlaceholder}
    />
  );
}

export const TailTagInput = forwardRef(Input);
