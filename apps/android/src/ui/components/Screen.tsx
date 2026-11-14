import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

interface ScreenProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  trailing?: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  testID?: string;
  titleTestID?: string;
  contentStyle?: StyleProp<ViewStyle>;
  maxWidth?: number;
  /** Pinned just below the top bar, outside the scroll region. */
  header?: React.ReactNode;
  /** Gap between top-level children in the body. Defaults to space[6]. */
  contentGap?: number;
}

/**
 * The screen scaffold: themed background, safe areas, optional header and a
 * pinned footer for the one primary action.
 */
export function Screen({
  children,
  title,
  subtitle,
  onBack,
  backLabel = 'Go back',
  trailing,
  footer,
  scroll = true,
  testID,
  titleTestID,
  contentStyle,
  maxWidth = 840,
  header,
  contentGap,
}: ScreenProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const showTopBar = Boolean(onBack || trailing);
  const gap = contentGap ?? theme.space[6];

  const body = (
    <View style={{ width: '100%', maxWidth, alignSelf: 'center', gap }}>
      {title || subtitle ? (
        <View style={{ gap: theme.space[2] }}>
          {title ? (
            <Text testID={titleTestID} variant="title1" accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="body" color={theme.color.text.secondary}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      testID={testID}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <View style={{ flex: 1, paddingTop: insets.top }}>
        {showTopBar ? (
          <View
            style={{
              minHeight: 56,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: theme.space[2],
              gap: theme.space[2],
            }}>
            {onBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={backLabel}
                onPress={onBack}
                hitSlop={8}
                style={{
                  width: theme.hit.min,
                  height: theme.hit.min,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon name="chevron-left" size={24} color={theme.color.text.primary} />
              </Pressable>
            ) : (
              <View style={{ width: theme.hit.min }} />
            )}
            <View style={{ flex: 1 }} />
            {trailing}
          </View>
        ) : null}

        {header ? <View style={{ flexShrink: 0 }}>{header}</View> : null}

        {scroll ? (
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              {
                paddingHorizontal: theme.space[4],
                paddingTop: showTopBar ? theme.space[2] : theme.space[6],
                paddingBottom: footer ? theme.space[8] : theme.space[8] + insets.bottom,
                gap: theme.space[6],
              },
              contentStyle,
            ]}>
            {body}
          </ScrollView>
        ) : (
          <View
            style={{
              flex: 1,
              paddingHorizontal: theme.space[4],
              paddingTop: showTopBar ? theme.space[2] : theme.space[6],
            }}>
            {body}
          </View>
        )}

        {footer ? (
          <View
            style={{
              borderTopWidth: theme.border.hairline,
              borderTopColor: theme.color.border.hairline,
              paddingHorizontal: theme.space[4],
              paddingTop: theme.space[3],
              paddingBottom: insets.bottom + theme.space[3],
              backgroundColor: theme.color.bg.canvas,
            }}>
            <View style={{ width: '100%', maxWidth, alignSelf: 'center', gap: theme.space[2] }}>
              {footer}
            </View>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}