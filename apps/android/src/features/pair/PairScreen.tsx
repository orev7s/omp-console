import React, { useState } from 'react';
import { View } from 'react-native';
import { useAppNavigation, useAppRouteParams } from '../../app/hooks';
import type { EntryParams } from '../../app/navigationTypes';
import { useConnection } from '../../state/connection';
import {
  Banner,
  Button,
  CodeField,
  Screen,
  ServerAddressField,
  Text,
} from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { parseAddress } from '../connect/parseAddress';

function defaultPort(mode: string): number {
  return mode === 'http' ? 80 : 443;
}

export function PairScreen(): React.JSX.Element {
  const theme = useTheme();
  const navigation = useAppNavigation();
  const params = useAppRouteParams<EntryParams>();

  const config = useConnection(s => s.config);
  const token = useConnection(s => s.token);
  const busy = useConnection(s => s.busy);
  const lastError = useConnection(s => s.lastError);
  const setConfig = useConnection(s => s.setConfig);
  const clearError = useConnection(s => s.clearError);
  const pair = useConnection(s => s.pair);
  const connect = useConnection(s => s.connect);

  const [code, setCode] = useState(params?.code ?? '');
  const [address, setAddress] = useState(params?.host ?? config.host);
  const [addressError, setAddressError] = useState<string | null>(null);

  const needsAddress = config.host.trim() === '';
  const paired = token !== null;

  const continueToHome = async (): Promise<void> => {
    clearError();
    await connect();
    navigation.replace('Home');
  };

  const submit = async (): Promise<void> => {
    clearError();
    if (needsAddress) {
      const parsed = parseAddress(address, defaultPort(config.mode));
      if (!parsed.ok) {
        setAddressError(parsed.error);
        return;
      }
      setAddressError(null);
      setConfig({ host: parsed.value.host, port: parsed.value.port });
    }
    if (code.trim() === '') return;
    const ok = await pair(code);
    if (ok) {
      await connect();
      navigation.replace('Home');
    }
  };

  return (
    <Screen
      testID="screen-pair"
      title="Pair your device"
      subtitle={
        paired
          ? 'This device is already paired.'
          : 'Enter the code your installer printed. It works once.'
      }
      onBack={() => navigation.goBack()}
      footer={
        paired ? (
          <Button
            testID="pair-continue"
            label="Continue to server"
            onPress={() => void continueToHome()}
            loading={busy}
          />
        ) : (
          <Button
            testID="pair-button"
            label="Pair device"
            onPress={() => void submit()}
            loading={busy}
            disabled={code.trim() === '' || (needsAddress && address.trim() === '')}
          />
        )
      }>
      {needsAddress && !paired ? (
        <ServerAddressField
          value={address}
          onChangeText={text => {
            setAddress(text);
            if (addressError) setAddressError(null);
          }}
          onSubmit={() => void submit()}
          error={addressError}
          inputTestID="pair-address-input"
        />
      ) : null}

      {!needsAddress && !paired ? (
        <Text variant="caption" color={theme.color.text.tertiary}>
          Server {config.host}:{config.port}
        </Text>
      ) : null}

      {paired ? (
        <Banner
          tone="live"
          title="Paired"
          message="A device token is stored on this phone. Continue to open the connection."
        />
      ) : (
        <CodeField
          value={code}
          onChangeText={text => {
            setCode(text);
            clearError();
          }}
          inputTestID="pair-code-input"
          autoFocus={!needsAddress}
        />
      )}

      {lastError ? (
        <Banner
          testID="pair-error"
          tone="danger"
          title={lastError.title}
          message={lastError.message}
        />
      ) : null}

      {!paired ? (
        <View>
          <Text variant="caption" color={theme.color.text.tertiary}>
            Codes are single use. If you lost this one, run the installer again
            on your server to print a new code.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}