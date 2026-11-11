import React from 'react';
import {
  Clipboard,
  Platform,
  Pressable,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

interface CodeFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
  testID?: string;
  inputTestID?: string;
  autoFocus?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

async function readClipboard(): Promise<string> {
  if (Platform.OS === 'web') {
    const nav = globalThis as unknown as {
      navigator?: { clipboard?: { readText?: () => Promise<string> } };
    };
    try {
      const text = await nav.navigator?.clipboard?.readText?.();
      return text ?? '';
    } catch {
      return '';
    }
  }
  try {
    return await Clipboard.getString();
  } catch {
    return '';
  }
}

/** The pairing-code entry. Big, mono, uppercase, with a paste action. */
export function CodeField({
  value,
  onChangeText,
  error,
  testID,
  inputTestID,
  autoFocus,
  containerStyle,
}: CodeFieldProps): React.JSX.Element {
  const theme = useTheme();

  const paste = async (): Promise<void> => {
    const text = (await readClipboard()).trim();
    if (text) onChangeText(text.toUpperCase());
  };

  return (
    <View style={[{ gap: theme.space[2] }, containerStyle]} testID={testID}>
      <Text variant="label" color={theme.color.text.secondary}>
        Pairing code
      </Text>
      <TextInput
        testID={inputTestID}
        value={value}
        onChangeText={text => onChangeText(text.toUpperCase())}
        placeholder="ABCD-1234"
        placeholderTextColor={theme.color.text.tertiary}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="done"
        accessibilityLabel="Pairing code"
        style={[
          theme.type.code,
          {
            height: theme.hit.code,
            borderRadius: theme.radius.md,
            borderWidth: error ? theme.border.emphasis : theme.border.control,
            borderColor: error ? theme.color.status.danger : theme.color.border.control,
            backgroundColor: theme.color.bg.sunken,
            color: theme.color.text.primary,
            textAlign: 'center',
            paddingHorizontal: theme.space[3],
          },
        ]}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {error ? (
          <Text
            variant="caption"
            color={theme.color.status.danger}
            style={{ flex: 1, paddingRight: theme.space[2] }}
            accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : (
          <Text variant="caption" color={theme.color.text.tertiary} style={{ flex: 1 }}>
            The installer prints this code once.
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Paste pairing code"
          onPress={() => void paste()}
          hitSlop={8}
          style={{ minHeight: theme.hit.min, justifyContent: 'center' }}>
          <Text variant="label" color={theme.color.accentText}>
            Paste
          </Text>
        </Pressable>
      </View>
    </View>
  );
}