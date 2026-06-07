import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import type { GestureResponderEvent, ImageSourcePropType, ViewStyle } from 'react-native';

import { styles } from './OAuthProviderButton.styles';

type OAuthProvider = 'google' | 'discord';

type OAuthProviderButtonProps = {
  provider: OAuthProvider;
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel: string;
  accessibilityHint: string;
};

const GOOGLE_ICON = require('../../../../assets/oauth/google/google-g.png') as ImageSourcePropType;
const DISCORD_LOGO =
  require('../../../../assets/oauth/discord/discord-logo-white.png') as ImageSourcePropType;

const PROVIDER_CONFIG: Record<
  OAuthProvider,
  {
    buttonStyle: ViewStyle;
    labelStyle: object;
    iconSource: ImageSourcePropType;
    iconStyle: object;
    iconPlacement: 'start' | 'end';
    indicatorColor: string;
    imageAccessibilityLabel: string;
  }
> = {
  google: {
    buttonStyle: styles.google,
    labelStyle: styles.googleLabel,
    iconSource: GOOGLE_ICON,
    iconStyle: styles.googleIcon,
    iconPlacement: 'start',
    indicatorColor: '#1f1f1f',
    imageAccessibilityLabel: 'Google',
  },
  discord: {
    buttonStyle: styles.discord,
    labelStyle: styles.discordLabel,
    iconSource: DISCORD_LOGO,
    iconStyle: styles.discordLogo,
    iconPlacement: 'end',
    indicatorColor: '#ffffff',
    imageAccessibilityLabel: 'Discord',
  },
};

export function OAuthProviderButton({
  provider,
  label,
  onPress,
  loading = false,
  disabled = false,
  style,
  accessibilityLabel,
  accessibilityHint,
}: OAuthProviderButtonProps) {
  const config = PROVIDER_CONFIG[provider];
  const isDisabled = disabled || loading;
  const providerImage = (
    <Image
      source={config.iconSource}
      style={config.iconStyle}
      resizeMode="contain"
      accessibilityLabel={config.imageAccessibilityLabel}
    />
  );
  const providerLabel = (
    <Text
      numberOfLines={1}
      style={[styles.label, config.labelStyle]}
    >
      {label}
    </Text>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        config.buttonStyle,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={config.indicatorColor} />
      ) : (
        <View style={styles.content}>
          {config.iconPlacement === 'start' ? providerImage : providerLabel}
          {config.iconPlacement === 'start' ? providerLabel : providerImage}
        </View>
      )}
    </Pressable>
  );
}
