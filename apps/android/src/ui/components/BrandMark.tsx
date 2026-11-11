import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { palette, useTheme } from '../theme';

interface BrandMarkProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The omp.console symbol, drawn from the brand grid (100 x 100): an Ink plate
 * with the pi bar and legs and one Signal node. In dark mode the plate flips to
 * Paper and the glyph to Ink. Drawn as Views so it stays crisp with no asset
 * pipeline. The plate radius approximates the brand superellipse (n = 4.2).
 */
export function BrandMark({ size = 56, style }: BrandMarkProps): React.JSX.Element {
  const theme = useTheme();
  const dark = theme.mode === 'dark';
  const plateColor = dark ? palette.paper : palette.ink;
  const glyphColor = dark ? palette.ink : palette.paper;
  const u = size / 100;
  const rect = (x: number, y: number, w: number, h: number, color: string): React.JSX.Element => (
    <View
      style={{
        position: 'absolute',
        left: x * u,
        top: y * u,
        width: w * u,
        height: h * u,
        backgroundColor: color,
      }}
    />
  );

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="omp.console"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.22,
          backgroundColor: plateColor,
        },
        style,
      ]}>
      {rect(22.8, 29.4, 54.4, 8.4, glyphColor)}
      {rect(34.8, 37.8, 8.4, 31.6, glyphColor)}
      {rect(56.4, 37.8, 8.4, 15.6, glyphColor)}
      {rect(52.6, 53.4, 16, 16, palette.signal)}
    </View>
  );
}