import React from 'react';
import { ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

interface SpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** The one progress primitive. Indeterminate only in Phase 1. */
export function Spinner({ size = 'small', color, style }: SpinnerProps): React.JSX.Element {
  const theme = useTheme();
  return <ActivityIndicator size={size} color={color ?? theme.color.accent} style={style} />;
}