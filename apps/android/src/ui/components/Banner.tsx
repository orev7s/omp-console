import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type BannerTone = 'info' | 'live' | 'warning' | 'danger' | 'insecure';

interface BannerProps {
  tone: BannerTone;
  title?: string;
  message: string;
  action?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

interface ToneStyle {
  bg: string;
  fg: string;
  border: string;
  icon: IconName;
}

/** A plain, one-per-screen status banner. Never a section. */
export function Banner({ tone, title, message, action, testID, style }: BannerProps): React.JSX.Element {
  const theme = useTheme();
  const tones: Record<BannerTone, ToneStyle> = {
    info: {
      bg: theme.color.status.infoSoft,
      fg: theme.color.status.info,
      border: theme.color.border.hairline,
      icon: 'info',
    },
    live: {
      bg: theme.color.status.liveSoft,
      fg: theme.color.text.primary,
      border: theme.color.accent,
      icon: 'check',
    },
    warning: {
      bg: theme.color.status.warningSoft,
      fg: theme.color.status.warning,
      border: theme.color.status.warning,
      icon: 'warning',
    },
    danger: {
      bg: theme.color.status.dangerSoft,
      fg: theme.color.status.danger,
      border: theme.color.status.danger,
      icon: 'warning',
    },
    insecure: {
      bg: theme.color.insecure.bg,
      fg: theme.color.insecure.fg,
      border: theme.color.insecure.border,
      icon: 'warning',
    },
  };
  const c = tones[tone];

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={[
        {
          flexDirection: 'row',
          gap: theme.space[3],
          padding: theme.space[4],
          borderRadius: theme.radius.lg,
          backgroundColor: c.bg,
          borderWidth: 1,
          borderColor: c.border,
        },
        style,
      ]}>
      <View style={{ paddingTop: 2 }}>
        <Icon name={c.icon} size={20} color={c.fg} />
      </View>
      <View style={{ flex: 1, gap: theme.space[1] }}>
        {title ? (
          <Text variant="bodyStrong" color={c.fg}>
            {title}
          </Text>
        ) : null}
        <Text variant="caption" color={c.fg}>
          {message}
        </Text>
        {action ? <View style={{ paddingTop: theme.space[2] }}>{action}</View> : null}
      </View>
    </View>
  );
}