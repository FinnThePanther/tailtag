import type { ForwardedRef } from 'react';
import { forwardRef } from 'react';
import type { TextInputProps } from 'react-native';
import { StyleSheet, TextInput } from 'react-native';

import { colors, radius, spacing } from '../../theme';

type TailTagInputProps = TextInputProps;

function Input(
  { style, ...rest }: TailTagInputProps,
  ref: ForwardedRef<TextInput>
) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor="rgba(148,163,184,0.7)"
      style={[styles.input, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.foreground,
    fontSize: 16,
    backgroundColor: 'rgba(15,23,42,0.8)',
  },
});

export const TailTagInput = forwardRef(Input);
