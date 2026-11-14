import React, { useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

interface CollapsibleProps {
  /** Plain text header. No icons; state is carried by the Show/Hide word. */
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  tone?: 'neutral' | 'danger';
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A tap-to-expand block on a sunken surface, collapsed by default. Used for
 * thinking and tool calls. The only affordance is the header text and the
 * trailing Show or Hide word, because the app ships no disclosure glyph.
 */
export function Collapsible({
  title,
  children,
  defaultOpen = false,
  tone = 'neutral',
  testID,
  style,
}: CollapsibleProps): React.JSX.Element {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const danger = tone === 'danger';

  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: theme.color.bg.sunken,
          borderRadius: theme.radius.md,
          borderWidth: theme.border.hairline,
          borderColor: theme.color.border.hairline,
          overflow: 'hidden',
        },
        style,
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${open ? 'hide' : 'show'}`}
        onPress={() => setOpen(value => !value)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.space[3],
          paddingHorizontal: theme.space[3],
          paddingVertical: theme.space[2],
          minHeight: theme.row.compact,
        }}>
        <Text
          variant="bodySmStrong"
          color={danger ? theme.color.status.danger : theme.color.text.secondary}
          numberOfLines={1}
          style={{ flexShrink: 1 }}>
          {title}
        </Text>
        <Text variant="caption" color={theme.color.text.tertiary}>
          {open ? 'Hide' : 'Show'}
        </Text>
      </Pressable>
      {open ? (
        <View
          style={{
            paddingHorizontal: theme.space[3],
            paddingTop: theme.space[2],
            paddingBottom: theme.space[3],
            gap: theme.space[2],
            borderTopWidth: theme.border.hairline,
            borderTopColor: theme.color.border.hairline,
          }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}
