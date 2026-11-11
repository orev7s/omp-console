import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

export type ChipTone = 'neutral' | 'live' | 'warning' | 'danger' | 'signal';

interface ChipProps {
  label: string;
  tone?: ChipTone;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** A small status tag. Never the only carrier of meaning. */
export function Chip({ label, tone = 'neutral', testID, style }: ChipProps): React.JSX.Element {
  const theme = useTheme();
  const colors: Record<ChipTone, { bg: string; fg: string; border: string }> = {
    neutral: {
      bg: theme.color.bg.sunken,
      fg: theme.color.text.secondary,
      border: theme.color.border.hairline,
    },
    live: {
      bg: theme.color.status.liveSoft,
      fg: theme.color.status.liveText,
      border: theme.color.accent,
    },
    warning: {
      bg: theme.color.status.warningSoft,
      fg: theme.color.status.warning,
      border: theme.color.status.warning,
    },
    danger: {
      bg: theme.color.status.dangerSoft,
      fg: theme.color.status.danger,
      border: theme.color.status.danger,
    },
    signal: {
      bg: theme.color.bg.tint,
      fg: theme.color.text.primary,
      border: theme.color.accent,
    },
  };
  const c = colors[tone];
  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          height: 28,
          paddingHorizontal: theme.space[3],
          borderRadius: theme.radius.full,
          backgroundColor: c.bg,
          borderWidth: 1,
          borderColor: c.border,
        },
        style,
      ]}>
      <Text variant="caption" color={c.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}