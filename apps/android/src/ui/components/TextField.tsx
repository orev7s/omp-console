import React, { useState } from 'react';
import {
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  helper?: string;
  error?: string | null;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  returnKeyType?: 'done' | 'go' | 'next' | 'send';
  onSubmitEditing?: () => void;
  secureTextEntry?: boolean;
  editable?: boolean;
  testID?: string;
  inputTestID?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  accessibilityHint?: string;
}

/** Labelled text input with focus, error, and helper states. */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  helper,
  error,
  keyboardType,
  autoCapitalize = 'none',
  autoCorrect = false,
  autoFocus,
  maxLength,
  returnKeyType,
  onSubmitEditing,
  secureTextEntry,
  editable = true,
  testID,
  inputTestID,
  containerStyle,
  inputStyle,
  accessibilityHint,
}: TextFieldProps): React.JSX.Element {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? theme.color.status.danger
    : focused
      ? theme.color.accent
      : theme.color.border.control;

  return (
    <View style={[{ gap: theme.space[1] }, containerStyle]} testID={testID}>
      <Text variant="label" color={theme.color.text.secondary}>
        {label}
      </Text>
      <TextInput
        testID={inputTestID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.color.text.tertiary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoFocus={autoFocus}
        maxLength={maxLength}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        secureTextEntry={secureTextEntry}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !editable }}
        style={[
          theme.type.body,
          {
            height: theme.hit.large,
            borderRadius: theme.radius.md,
            borderWidth: focused || error ? theme.border.emphasis : theme.border.control,
            borderColor,
            backgroundColor: theme.color.bg.sunken,
            paddingHorizontal: theme.space[3],
            color: editable ? theme.color.text.primary : theme.color.text.disabled,
          },
          inputStyle,
        ]}
      />
      {error ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] }}
          accessibilityLiveRegion="polite">
          <Icon name="warning" size={14} color={theme.color.status.danger} />
          <Text variant="caption" color={theme.color.status.danger} style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text variant="caption" color={theme.color.text.tertiary}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}