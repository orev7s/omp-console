import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  easing,
  useNativeDriver,
  useReducedMotion,
  useTheme,
} from '../theme';
import { Text } from './Text';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** A phone bottom sheet with a drag handle. Used for confirmations. */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  testID,
  style,
}: BottomSheetProps): React.JSX.Element {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    progress.setValue(reduced ? 0 : 1);
    if (reduced) return;
    Animated.timing(progress, {
      toValue: 0,
      duration: theme.motion.duration.medium,
      easing: easing.decelerate,
      useNativeDriver,
    }).start();
  }, [visible, reduced, progress, theme.motion.duration.medium]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 420] });
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }} testID={testID}>
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme.color.scrim,
            opacity: backdropOpacity,
          }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={{ flex: 1 }}
          />
        </Animated.View>
        <Animated.View
          style={[
            {
              backgroundColor: theme.color.bg.card,
              borderTopLeftRadius: theme.radius['2xl'],
              borderTopRightRadius: theme.radius['2xl'],
              paddingHorizontal: theme.space[5],
              paddingTop: theme.space[3],
              paddingBottom: theme.space[8],
              gap: theme.space[4],
              transform: [{ translateY }],
            },
            theme.elevation.sheet,
            style,
          ]}>
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.color.border.control,
              marginBottom: theme.space[1],
            }}
          />
          {title ? <Text variant="title2">{title}</Text> : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}