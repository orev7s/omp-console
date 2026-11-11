/**
 * Semantic colour roles. Components read these, never the raw palette.
 * Every pair that carries text or a UI boundary is contrast-gated in design.md.
 */
import { palette } from './primitives';

export interface ThemeColors {
  bg: {
    canvas: string;
    card: string;
    sunken: string;
    tint: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    disabled: string;
    onSignal: string;
    onDanger: string;
  };
  accent: string;
  accentText: string;
  border: {
    hairline: string;
    control: string;
    strong: string;
  };
  focus: string;
  scrim: string;
  status: {
    live: string;
    liveText: string;
    liveSoft: string;
    pending: string;
    danger: string;
    dangerSoft: string;
    onDanger: string;
    warning: string;
    warningSoft: string;
    info: string;
    infoSoft: string;
  };
  insecure: {
    fg: string;
    bg: string;
    border: string;
  };
}

export const lightColors: ThemeColors = {
  bg: {
    canvas: palette.paper,
    card: palette.paperLift,
    sunken: palette.bone,
    tint: palette.signalSoftLight,
  },
  text: {
    primary: palette.ink,
    secondary: palette.graphite,
    tertiary: palette.textTertiaryLight,
    disabled: palette.textDisabledLight,
    onSignal: palette.ink,
    onDanger: palette.white,
  },
  accent: palette.signal,
  accentText: palette.signalDeep,
  border: {
    hairline: 'rgba(20,22,26,0.12)',
    control: palette.lineLight,
    strong: palette.graphite,
  },
  focus: palette.signal,
  scrim: 'rgba(20,22,26,0.40)',
  status: {
    live: palette.signal,
    liveText: palette.signalDeep,
    liveSoft: palette.signalSoftLight,
    pending: palette.textTertiaryLight,
    danger: palette.danger,
    dangerSoft: palette.dangerSoftLight,
    onDanger: palette.white,
    warning: palette.warning,
    warningSoft: palette.warningSoftLight,
    info: palette.graphite,
    infoSoft: palette.bone,
  },
  insecure: {
    fg: palette.warning,
    bg: palette.warningSoftLight,
    border: palette.insecureBorderLight,
  },
};

export const darkColors: ThemeColors = {
  bg: {
    canvas: palette.ink,
    card: palette.inkCard,
    sunken: palette.inkSunken,
    tint: palette.signalSoftDark,
  },
  text: {
    primary: palette.paper,
    secondary: palette.textSecondaryDark,
    tertiary: palette.textTertiaryDark,
    disabled: palette.textDisabledDark,
    onSignal: palette.ink,
    onDanger: palette.ink,
  },
  accent: palette.signal,
  accentText: palette.signal,
  border: {
    hairline: 'rgba(250,248,243,0.12)',
    control: palette.textTertiaryDark,
    strong: palette.textSecondaryDark,
  },
  focus: palette.signal,
  scrim: 'rgba(0,0,0,0.55)',
  status: {
    live: palette.signal,
    liveText: palette.signal,
    liveSoft: palette.signalSoftDark,
    pending: palette.textTertiaryDark,
    danger: palette.dangerDark,
    dangerSoft: palette.dangerSoftDark,
    onDanger: palette.ink,
    warning: palette.warningDark,
    warningSoft: palette.warningSoftDark,
    info: palette.textSecondaryDark,
    infoSoft: palette.inkCard,
  },
  insecure: {
    fg: palette.warningDark,
    bg: palette.warningSoftDark,
    border: palette.insecureBorderDark,
  },
};