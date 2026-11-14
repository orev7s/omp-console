import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

interface SectionHeaderProps {
  label: string;
  action?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** A quiet, uppercase group label with an optional trailing text action. */
export function SectionHeader({
  label,
  action,
  testID,
  style,
}: SectionHeaderProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.space[2],
        },
        style,
      ]}>
      <Text variant="overline" color={theme.color.text.tertiary}>
        {label}
      </Text>
      {action}
    </View>
  );
}
