import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  testIDPrefix?: string;
  style?: StyleProp<ViewStyle>;
}

/** Exclusive choice, pill track, one filled segment. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  testIDPrefix,
  style,
}: SegmentedControlProps<T>): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flexDirection: 'row',
          padding: theme.space[1],
          gap: theme.space[1],
          borderRadius: theme.radius.full,
          backgroundColor: theme.color.bg.sunken,
        },
        style,
      ]}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={testIDPrefix ? `${testIDPrefix}-${option.value}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: 40,
              paddingHorizontal: theme.space[2],
              borderRadius: theme.radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? theme.color.accent : 'transparent',
            }}>
            <Text
              variant="label"
              color={selected ? theme.color.text.onSignal : theme.color.text.secondary}
              numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}