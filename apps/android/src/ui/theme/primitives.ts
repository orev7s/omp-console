/**
 * Raw brand values. Screens and components must use the semantic theme in
 * `./index`, not these primitives directly. They exist so the semantics can be
 * rebuilt without hunting for hex codes.
 *
 * Source: OMP-console-identity brand guidelines v1.0, plus the WCAG-gated
 * derivations recorded in design.md.
 */

export const palette = {
  ink: '#14161A',
  ink2: '#1B1E23',
  ink3: '#23272D',
  ink4: '#2E3238',
  ink5: '#3A3E45',
  graphite: '#4A4D53',
  bone: '#F1EDE4',
  paper: '#FAF8F3',
  signal: '#F0561E',
  signalDeep: '#C4451A',
  white: '#FFFFFF',

  // Derived light surfaces and text.
  paperLift: '#FFFEFB',
  lineLight: '#8B867C',
  textTertiaryLight: '#6E7178',
  textDisabledLight: '#A8A49B',

  // Derived dark surfaces and text.
  inkCard: '#1E2228',
  inkSunken: '#0F1114',
  textSecondaryDark: '#B4B0A7',
  textTertiaryDark: '#8A877F',
  textDisabledDark: '#5C5F66',

  // Functional status ramps (engine-gated).
  danger: '#A8271B',
  dangerDark: '#EF7A6D',
  warning: '#8A5A00',
  warningDark: '#E0A23C',

  // Tinted surfaces.
  signalSoftLight: '#FBE7DD',
  dangerSoftLight: '#F6E4E1',
  warningSoftLight: '#F7EFD9',
  signalSoftDark: '#3A241C',
  dangerSoftDark: '#34201E',
  warningSoftDark: '#2E2411',
  insecureBorderLight: '#B87912',
  insecureBorderDark: '#8A5A00',
} as const;

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 28,
  full: 999,
} as const;

export const borderWidth = {
  hairline: 1,
  control: 1,
  emphasis: 2,
} as const;

export const hitTarget = {
  min: 48,
  large: 52,
  code: 64,
} as const;

export const duration = {
  instant: 0,
  fast: 120,
  base: 180,
  medium: 240,
  slow: 320,
  slower: 420,
} as const;

export const spring = {
  press: { stiffness: 420, damping: 28, mass: 0.6 },
  settle: { stiffness: 210, damping: 22, mass: 1 },
} as const;

export const typeScale = {
  display: { size: 32, weight: '700', lineHeight: 1.15, tracking: -0.32 },
  title1: { size: 24, weight: '700', lineHeight: 1.2, tracking: -0.24 },
  title2: { size: 19, weight: '600', lineHeight: 1.25, tracking: -0.19 },
  body: { size: 16, weight: '400', lineHeight: 1.45, tracking: 0 },
  bodyStrong: { size: 16, weight: '600', lineHeight: 1.45, tracking: 0 },
  label: { size: 14, weight: '600', lineHeight: 1.35, tracking: 0 },
  caption: { size: 12, weight: '400', lineHeight: 1.45, tracking: 0 },
  overline: { size: 12, weight: '600', lineHeight: 1.3, tracking: 1.2 },
  code: { size: 22, weight: '600', lineHeight: 1.2, tracking: 4 },
  mono: { size: 13, weight: '400', lineHeight: 1.5, tracking: 0 },
  monoLabel: { size: 12, weight: '600', lineHeight: 1.4, tracking: 0.8 },
} as const;

export type TypeVariant = keyof typeof typeScale;

/** Families resolvable per platform. Native uses the bundled file names. */
export const fontFamily = {
  sansWeb: 'Inter',
  monoWeb: 'JetBrains Mono',
  sansNative: {
    '400': 'Inter_400Regular',
    '500': 'Inter_500Medium',
    '600': 'Inter_600SemiBold',
    '700': 'Inter_700Bold',
  },
  monoNative: {
    '400': 'JetBrainsMono_400Regular',
    '500': 'JetBrainsMono_500Medium',
  },
} as const;

export const monoVariants: ReadonlySet<TypeVariant> = new Set([
  'code',
  'mono',
  'monoLabel',
]);