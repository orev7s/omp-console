import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';

export interface SessionTab {
  id: string;
  title: string;
}

interface TabStripProps {
  tabs: SessionTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

/**
 * Open sessions as a horizontal, scrollable strip. This follows the web app's
 * tab bar: a 42 px row, 14 px medium labels, a hairline rule along the bottom of
 * the strip, and a 2 px signal underline on the active tab. The close control is
 * the word Close; the app ships no close glyph. A tab switches sessions, it does
 * not push a route.
 */
export function TabStrip({
  tabs,
  activeId,
  onSelect,
  onClose,
}: TabStripProps): React.JSX.Element | null {
  const theme = useTheme();
  if (tabs.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{
        flexGrow: 0,
        backgroundColor: theme.color.bg.canvas,
        borderBottomWidth: theme.border.hairline,
        borderBottomColor: theme.color.border.hairline,
      }}
      contentContainerStyle={{ alignItems: 'stretch' }}>
      {tabs.map(tab => {
        const active = tab.id === activeId;
        return (
          <View
            key={tab.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderRightWidth: theme.border.hairline,
              borderRightColor: theme.color.border.hairline,
              borderBottomWidth: 2,
              borderBottomColor: active ? theme.color.accent : 'transparent',
              backgroundColor: active ? theme.color.bg.card : 'transparent',
            }}>
            <Pressable
              testID={`session-tab-${tab.id}`}
              accessibilityRole="tab"
              accessibilityLabel={tab.title}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(tab.id)}
              style={{
                minHeight: theme.row.tab,
                justifyContent: 'center',
                paddingLeft: theme.space[4],
                paddingRight: theme.space[2],
              }}>
              <Text
                variant="label"
                color={active ? theme.color.text.primary : theme.color.text.secondary}
                numberOfLines={1}
                style={{ maxWidth: 160 }}>
                {tab.title}
              </Text>
            </Pressable>
            <Pressable
              testID={`session-tab-close-${tab.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Close ${tab.title}`}
              onPress={() => onClose(tab.id)}
              hitSlop={8}
              style={{
                minHeight: theme.row.tab,
                justifyContent: 'center',
                paddingRight: theme.space[3],
              }}>
              <Text variant="caption" color={theme.color.text.tertiary}>
                Close
              </Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}
