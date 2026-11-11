import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

export type IconName =
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'check'
  | 'close'
  | 'warning'
  | 'info';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A deliberately tiny monochrome icon set, drawn with Views so the app needs no
 * icon font or SVG dependency. Sizes 16, 20, 24. Decorative beside a label.
 */
export function Icon({ name, size = 20, color, style }: IconProps): React.JSX.Element {
  const theme = useTheme();
  const tint = color ?? theme.color.text.primary;
  const stroke = Math.max(1.5, Math.round(size / 10));

  if (name === 'warning' || name === 'info') {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: stroke,
            borderColor: tint,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}>
        <View
          style={{
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <View
            style={{
              backgroundColor: tint,
              width: stroke,
              height: size * (name === 'warning' ? 0.34 : 0.06),
              marginTop: name === 'warning' ? 0 : size * 0.14,
            }}
          />
          {name === 'info' ? null : (
            <View
              style={{
                backgroundColor: tint,
                width: stroke,
                height: stroke,
                marginTop: size * 0.1,
              }}
            />
          )}
          {name === 'info' ? (
            <View
              style={{
                backgroundColor: tint,
                width: stroke,
                height: size * 0.34,
                marginTop: size * 0.08,
              }}
            />
          ) : null}
        </View>
      </View>
    );
  }

  if (name === 'check') {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
        <View
          style={{
            width: size * 0.5,
            height: size * 0.85,
            borderRightWidth: stroke,
            borderBottomWidth: stroke,
            borderColor: tint,
            transform: [{ rotate: '45deg' }, { translateY: -size * 0.08 }],
          }}
        />
      </View>
    );
  }

  if (name === 'close') {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
        <View style={{ position: 'absolute', width: size * 0.72, height: stroke, backgroundColor: tint, transform: [{ rotate: '45deg' }] }} />
        <View style={{ position: 'absolute', width: size * 0.72, height: stroke, backgroundColor: tint, transform: [{ rotate: '-45deg' }] }} />
      </View>
    );
  }

  const rotation =
    name === 'chevron-right' ? '45deg' : name === 'chevron-left' ? '-135deg' : '135deg';

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <View
        style={{
          width: size * 0.42,
          height: size * 0.42,
          borderTopWidth: stroke,
          borderRightWidth: stroke,
          borderColor: tint,
          transform: [{ rotate: rotation }],
        }}
      />
    </View>
  );
}