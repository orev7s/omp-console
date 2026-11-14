import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

interface ListRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  leading?: React.ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  showChevron?: boolean;
  divider?: boolean;
  /** Tighter row for shell chrome. Defaults to false. */
  dense?: boolean;
}

/** One row in a grouped list. The whole row is a single accessible unit. */
export function ListRow({
  title,
  subtitle,
  value,
  onPress,
  leading,
  testID,
  accessibilityLabel,
  showChevron = false,
  divider = true,
  dense = false,
}: ListRowProps): React.JSX.Element {
  const theme = useTheme();
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        minHeight: dense ? theme.row.dense : 52,
        paddingVertical: dense ? theme.space[1] : theme.space[2],
      }}>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant={dense ? 'bodySmStrong' : 'bodyStrong'}>{title}</Text>
        {subtitle ? (
          <Text variant="caption" color={theme.color.text.secondary}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="caption" color={theme.color.text.secondary} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {showChevron ? <Icon name="chevron-right" size={18} color={theme.color.text.tertiary} /> : null}
    </View>
  );

  const border = divider
    ? { borderBottomWidth: theme.border.hairline, borderBottomColor: theme.color.border.hairline }
    : null;

  if (!onPress) return <View testID={testID} style={border}>{content}</View>;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [border, pressed ? { opacity: 0.7 } : null]}>
      {content}
    </Pressable>
  );
}