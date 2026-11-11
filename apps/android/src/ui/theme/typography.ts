/**
 * Type styles. The brand sets Inter for UI and JetBrains Mono for code. Native
 * builds use the bundled single-weight families; the web harness uses the
 * loaded webfont families plus a numeric weight.
 */
import { Platform, type TextStyle } from 'react-native';
import { fontFamily, monoVariants, typeScale, type TypeVariant } from './primitives';

export type TypeStyles = Record<TypeVariant, TextStyle>;

type Weight = '400' | '500' | '600' | '700';

function isWeight(value: string): value is Weight {
  return value === '400' || value === '500' || value === '600' || value === '700';
}

function familyFor(variant: TypeVariant, weight: string): string {
  const mono = monoVariants.has(variant);
  if (Platform.OS === 'web') {
    return mono
      ? `'${fontFamily.monoWeb}', ui-monospace, monospace`
      : `'${fontFamily.sansWeb}', system-ui, sans-serif`;
  }
  if (mono) {
    return weight === '500'
      ? fontFamily.monoNative['500']
      : fontFamily.monoNative['400'];
  }
  const safe: Weight = isWeight(weight) ? weight : '400';
  return fontFamily.sansNative[safe];
}

export function buildTypeStyles(): TypeStyles {
  const styles = {} as TypeStyles;
  (Object.keys(typeScale) as TypeVariant[]).forEach(variant => {
    const spec = typeScale[variant];
    const base: TextStyle = {
      fontFamily: familyFor(variant, spec.weight),
      fontSize: spec.size,
      lineHeight: Math.round(spec.size * spec.lineHeight),
      letterSpacing: spec.tracking,
      // Native families carry their own weight, so do not double-apply it.
      ...(Platform.OS === 'web'
        ? { fontWeight: spec.weight as TextStyle['fontWeight'] }
        : null),
    };
    styles[variant] = base;
  });
  return styles;
}