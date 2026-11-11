import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { TextField } from './TextField';

interface ServerAddressFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit?: () => void;
  error?: string | null;
  testID?: string;
  inputTestID?: string;
  autoFocus?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * One field for the server address. Accepts host, host:port, or a full URL.
 * Parsing happens on submit in `parseAddress`, not per keystroke.
 */
export function ServerAddressField({
  value,
  onChangeText,
  onSubmit,
  error,
  testID,
  inputTestID,
  autoFocus,
  containerStyle,
}: ServerAddressFieldProps): React.JSX.Element {
  return (
    <TextField
      label="Server address"
      value={value}
      onChangeText={onChangeText}
      placeholder="vps.example.com"
      helper="Host or IP, optionally with a port."
      error={error}
      keyboardType="url"
      autoCapitalize="none"
      autoCorrect={false}
      autoFocus={autoFocus}
      returnKeyType="go"
      onSubmitEditing={onSubmit}
      testID={testID}
      inputTestID={inputTestID}
      containerStyle={containerStyle}
      accessibilityHint="Host name or IP address"
    />
  );
}