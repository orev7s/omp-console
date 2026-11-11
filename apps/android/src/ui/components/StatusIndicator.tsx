import React, { useEffect, useRef } from 'react';
import { Animated, View, type StyleProp, type ViewStyle } from 'react-native';
import { useNativeDriver, useReducedMotion, useTheme } from '../theme';
import { Text } from './Text';

export type StatusState = 'offline' | 'connecting' | 'live' | 'error';

interface StatusIndicatorProps {
  state: StatusState;
  label?: string;
  size?: 'inline' | 'hero';
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_LABEL: Record<StatusState, string> = {
  offline: 'Not connected',
  connecting: 'Connecting',
  live: 'Connected',
  error: 'Cannot reach server',
};

/** A dot plus a human sentence. The dot is never the only signal. */
export function StatusIndicator({
  state,
  label,
  size = 'inline',
  testID,
  style,
}: StatusIndicatorProps): React.JSX.Element {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state !== 'connecting' || reduced) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1200,
        useNativeDriver,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [state, reduced, pulse]);

  const dotColor: Record<StatusState, string> = {
    offline: theme.color.text.tertiary,
    connecting: theme.color.status.pending,
    live: theme.color.accent,
    error: theme.color.status.danger,
  };

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.5] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={label ?? DEFAULT_LABEL[state]}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }, style]}>
      <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
        {state === 'connecting' && !reduced ? (
          <Animated.View
            style={{
              position: 'absolute',
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: dotColor[state],
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            }}
          />
        ) : null}
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: dotColor[state],
          }}
        />
      </View>
      <Text
        variant={size === 'hero' ? 'title2' : 'body'}
        color={state === 'error' ? theme.color.status.danger : theme.color.text.primary}>
        {label ?? DEFAULT_LABEL[state]}
      </Text>
    </View>
  );
}