import React from 'react';
import {
  Text as RNText,
  type TextProps,
  type TextStyle,
} from 'react-native';
import { useTheme, type TypeVariant } from '../theme';

interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: string;
  align?: TextStyle['textAlign'];
}

/** The single text primitive. Applies the brand type scale. */
export function Text({
  variant = 'body',
  color,
  align,
  style,
  children,
  ...rest
}: AppTextProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        theme.type[variant],
        { color: color ?? theme.color.text.primary },
        align ? { textAlign: align } : null,
        style,
      ]}>
      {children}
    </RNText>
  );
}