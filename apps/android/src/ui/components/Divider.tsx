import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

interface DividerProps {
  style?: StyleProp<ViewStyle>;
}

/** A hairline rule between grouped rows. */
export function Divider({ style }: DividerProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          height: theme.border.hairline,
          backgroundColor: theme.color.border.hairline,
        },
        style,
      ]}
    />
  );
}
