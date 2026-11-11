import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useNativeDriver, useReducedMotion, useTheme } from '../theme';
import { spring } from '../theme/primitives';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'lg' | 'md' | 'sm';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  fullWidth?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<ButtonSize, number> = { lg: 52, md: 48, sm: 40 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  icon,
  fullWidth,
  testID,
  accessibilityLabel,
  style,
}: ButtonProps): React.JSX.Element {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;
  const stretch = fullWidth ?? size === 'lg';

  const animate = (toValue: number): void => {
    if (reduced) {
      scale.setValue(toValue);
      return;
    }
    Animated.spring(scale, {
      toValue,
      useNativeDriver,
      stiffness: spring.press.stiffness,
      damping: spring.press.damping,
      mass: spring.press.mass,
    }).start();
  };

  const fill: Record<ButtonVariant, string> = {
    primary: theme.color.accent,
    secondary: theme.color.bg.card,
    ghost: 'transparent',
    destructive: theme.color.status.danger,
  };
  const fg: Record<ButtonVariant, string> = {
    primary: theme.color.text.onSignal,
    secondary: theme.color.text.primary,
    ghost: theme.color.accentText,
    destructive: theme.color.status.onDanger,
  };
  const disabledFill = variant === 'ghost' ? 'transparent' : theme.color.bg.sunken;
  const disabledFg = theme.color.text.disabled;

  return (
    <Animated.View
      style={[{ transform: [{ scale }] }, stretch ? { width: '100%' } : null, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        disabled={isDisabled}
        onPress={onPress}
        onPressIn={() => animate(0.97)}
        onPressOut={() => animate(1)}
        hitSlop={size === 'sm' ? { top: 4, bottom: 4 } : undefined}
        style={({ pressed }) => [
          {
            height: HEIGHT[size],
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.space[5],
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDisabled ? disabledFill : fill[variant],
            borderWidth: variant === 'secondary' ? theme.border.control : 0,
            borderColor: theme.color.border.control,
          },
          pressed && !isDisabled ? { opacity: 0.9 } : null,
        ]}>
        {loading ? (
          <Spinner color={isDisabled ? disabledFg : fg[variant]} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
            {icon ? <Icon name={icon} size={18} color={isDisabled ? disabledFg : fg[variant]} /> : null}
            <Text
              variant={size === 'lg' ? 'bodyStrong' : 'label'}
              color={isDisabled ? disabledFg : fg[variant]}
              numberOfLines={1}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}