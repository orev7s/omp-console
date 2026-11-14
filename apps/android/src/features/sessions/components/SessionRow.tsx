import React from 'react';
import { Pressable, View } from 'react-native';
import type { SessionState } from '@omp-console/protocol';
import { Text } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';
import { formatRelativeTime } from '../relativeTime';
import { sessionStateLabel, sessionStateTone } from '../sessionState';

interface SessionRowProps {
  title: string;
  folder: string;
  state: SessionState;
  updatedAt: string;
  divider?: boolean;
  onPress: () => void;
  testID?: string;
}

/**
 * A compact session row: title and folder on the left, the state word and a
 * relative time on the right. This mirrors the web app's session rows, which
 * are one dense line per session.
 */
export function SessionRow({
  title,
  folder,
  state,
  updatedAt,
  divider = true,
  onPress,
  testID,
}: SessionRowProps): React.JSX.Element {
  const theme = useTheme();
  const tone = sessionStateTone(state);
  const stateColor =
    tone === 'danger'
      ? theme.color.status.danger
      : tone === 'live'
        ? theme.color.accentText
        : theme.color.text.tertiary;
  const relative = formatRelativeTime(updatedAt);

  const border = divider
    ? { borderBottomWidth: theme.border.hairline, borderBottomColor: theme.color.border.hairline }
    : null;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sessionStateLabel(state)}`}
      onPress={onPress}
      style={({ pressed }) => [
        border,
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[3],
          minHeight: theme.row.dense,
          paddingVertical: theme.space[2],
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="bodySmStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color={theme.color.text.secondary} numberOfLines={1}>
          {folder}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 1 }}>
        <Text variant="caption" color={theme.color.text.tertiary} numberOfLines={1}>
          {relative}
        </Text>
        <Text variant="caption" color={stateColor} numberOfLines={1}>
          {sessionStateLabel(state)}
        </Text>
      </View>
    </Pressable>
  );
}
