import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';

interface ProjectRowProps {
  name: string;
  path: string;
  onRemove: () => void;
  divider?: boolean;
}

/** A dense project row: name and path, with a Remove word action. */
export function ProjectRow({ name, path, onRemove, divider = true }: ProjectRowProps): React.JSX.Element {
  const theme = useTheme();
  const border = divider
    ? { borderBottomWidth: theme.border.hairline, borderBottomColor: theme.color.border.hairline }
    : null;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[3],
          minHeight: theme.row.dense,
          paddingVertical: theme.space[2],
        },
        border,
      ]}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="bodySmStrong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" color={theme.color.text.secondary} numberOfLines={1}>
          {path}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${name}`}
        onPress={onRemove}
        hitSlop={8}
        style={{ minHeight: 32, justifyContent: 'center' }}>
        <Text variant="caption" color={theme.color.accentText}>
          Remove
        </Text>
      </Pressable>
    </View>
  );
}
