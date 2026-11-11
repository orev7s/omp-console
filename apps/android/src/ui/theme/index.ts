/**
 * The theme. Screens call `useTheme()` and read semantic roles only.
 */
import { useColorScheme, type ViewStyle } from 'react-native';
import { borderWidth, hitTarget, radius, space } from './primitives';
import { motion } from './motion';
import { darkColors, lightColors, type ThemeColors } from './semantic';
import { buildTypeStyles, type TypeStyles } from './typography';

export type ColorMode = 'light' | 'dark';

export interface Theme {
  mode: ColorMode;
  color: ThemeColors;
  space: typeof space;
  radius: typeof radius;
  border: typeof borderWidth;
  hit: typeof hitTarget;
  type: TypeStyles;
  motion: typeof motion;
  elevation: {
    none: ViewStyle;
    card: ViewStyle;
    raised: ViewStyle;
    sheet: ViewStyle;
  };
}

const typeStyles = buildTypeStyles();

const lightElevation: Theme['elevation'] = {
  none: {},
  card: {
    shadowColor: '#14161A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#14161A',
    shadowOpacity: 0.09,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sheet: {
    shadowColor: '#14161A',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
};

const darkElevation: Theme['elevation'] = {
  none: {},
  card: {},
  raised: {},
  sheet: {},
};

export const lightTheme: Theme = {
  mode: 'light',
  color: lightColors,
  space,
  radius,
  border: borderWidth,
  hit: hitTarget,
  type: typeStyles,
  motion,
  elevation: lightElevation,
};

export const darkTheme: Theme = {
  mode: 'dark',
  color: darkColors,
  space,
  radius,
  border: borderWidth,
  hit: hitTarget,
  type: typeStyles,
  motion,
  elevation: darkElevation,
};

export function themeFor(scheme: 'light' | 'dark' | null | undefined): Theme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}

export function useTheme(): Theme {
  return themeFor(useColorScheme());
}

export type { ThemeColors, TypeStyles };
export { motion } from './motion';
export { useReducedMotion, useNativeDriver, easing } from './motion';
export { palette, space, radius } from './primitives';
export type { TypeVariant } from './primitives';