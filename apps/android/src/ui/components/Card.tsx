import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

interface CardProps {
  children: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}

/** A grouped surface. At most one hero card per screen. */
export function Card({ children, testID, style, elevated = true }: CardProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: theme.color.bg.card,
          borderRadius: theme.radius.lg,
          borderWidth: theme.border.hairline,
          borderColor: theme.color.border.hairline,
          padding: theme.space[5],
          gap: theme.space[3],
        },
        elevated ? theme.elevation.card : null,
        style,
      ]}>
      {children}
    </View>
  );
}