import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { ConnectionMode } from '@omp-console/protocol';
import { useAppNavigation, useAppRouteParams } from '../../app/hooks';
import type { EntryParams } from '../../app/navigationTypes';
import { useConnection } from '../../state/connection';
import {
  Banner,
  BottomSheet,
  Button,
  Chip,
  Icon,
  Screen,
  SegmentedControl,
  ServerAddressField,
  Text,
  TextField,
} from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { formatAddress, parseAddress } from './parseAddress';

type Security = 'secure' | 'http';
type CertChoice = 'domain' | 'ip' | 'private';

const SECURITY_OPTIONS = [
  { value: 'secure' as const, label: 'Secure' },
  { value: 'http' as const, label: 'Plain HTTP' },
];

const CERT_OPTIONS = [
  { value: 'domain' as const, label: 'Domain' },
  { value: 'ip' as const, label: 'IP address' },
  { value: 'private' as const, label: 'Private' },
];

function defaultPort(mode: ConnectionMode): number {
  return mode === 'http' ? 80 : 443;
}

function certForMode(mode: ConnectionMode): CertChoice {
  if (mode === 'https_ip') return 'ip';
  if (mode === 'https_private') return 'private';
  return 'domain';
}

function modeFor(security: Security, cert: CertChoice): ConnectionMode {
  if (security === 'http') return 'http';
  if (cert === 'ip') return 'https_ip';
  if (cert === 'private') return 'https_private';
  return 'https_domain';
}

export function ConnectScreen(): React.JSX.Element {
  const theme = useTheme();
  const navigation = useAppNavigation();
  const params = useAppRouteParams<EntryParams>();

  const config = useConnection(s => s.config);
  const token = useConnection(s => s.token);
  const lastError = useConnection(s => s.lastError);
  const setConfig = useConnection(s => s.setConfig);
  const clearError = useConnection(s => s.clearError);
  const connect = useConnection(s => s.connect);

  const initialMode = params?.mode ?? config.mode;
  const initialSecurity: Security = initialMode === 'http' ? 'http' : 'secure';

  const [address, setAddress] = useState(
    params?.host ?? formatAddress(config.host, config.port, defaultPort(initialMode)),
  );
  const [port, setPort] = useState(String(params?.port ?? config.port));
  const [security, setSecurity] = useState<Security>(initialSecurity);
  const [cert, setCert] = useState<CertChoice>(certForMode(initialMode));
  const [deviceName, setDeviceName] = useState(config.deviceName);
  const [acknowledged, setAcknowledged] = useState(initialSecurity === 'http');
  const [advanced, setAdvanced] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const insecure = security === 'http';
  const canContinue = !submitting && (!insecure || acknowledged);

  const changeSecurity = (next: Security): void => {
    setSecurity(next);
    setAcknowledged(next === 'secure');
    clearError();
    if (next === 'http' && port === '443') setPort('80');
    if (next === 'secure' && port === '80') setPort('443');
  };

  const submit = async (): Promise<void> => {
    const mode = modeFor(security, cert);
    const fallback = defaultPort(mode);
    const parsed = parseAddress(address, Number(port) || fallback);
    if (!parsed.ok) {
      setAddressError(parsed.error);
      return;
    }
    setAddressError(null);
    clearError();
    setConfig({
      host: parsed.value.host,
      port: parsed.value.port,
      mode,
      deviceName: deviceName.trim() || 'Android device',
    });

    if (token) {
      setSubmitting(true);
      const ok = await connect();
      setSubmitting(false);
      if (ok) navigation.replace('Home');
      return;
    }
    navigation.navigate('Pair', { code: params?.code });
  };

  const warningAction = acknowledged ? (
    <Chip testID="insecure-confirmed" label="Plain HTTP confirmed" tone="warning" />
  ) : (
    <Button
      testID="insecure-ack"
      label="I understand the risk"
      variant="secondary"
      size="md"
      fullWidth={false}
      onPress={() => setSheetVisible(true)}
    />
  );

  return (
    <>
      <Screen
        testID="screen-connect"
        title="Connect to your server"
        subtitle="Use the address your installer printed. HTTPS is on by default."
        onBack={() => navigation.goBack()}
        footer={
          <Button
            testID="connect-continue"
            label={token ? 'Connect' : 'Continue'}
            onPress={() => void submit()}
            loading={submitting}
            disabled={!canContinue}
          />
        }>
        <ServerAddressField
          value={address}
          onChangeText={text => {
            setAddress(text);
            if (addressError) setAddressError(null);
          }}
          onSubmit={() => void submit()}
          error={addressError}
          inputTestID="server-address-input"
          autoFocus={!config.host}
        />

        {insecure ? (
          <Chip testID="connect-insecure-chip" label="Unencrypted" tone="warning" />
        ) : null}

        <Pressable
          testID="advanced-toggle"
          accessibilityRole="button"
          accessibilityLabel="Advanced connection settings"
          accessibilityState={{ expanded: advanced }}
          onPress={() => setAdvanced(value => !value)}
          style={{
            minHeight: theme.hit.min,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          <Text variant="label" color={theme.color.accentText}>
            Advanced
          </Text>
          <Icon
            name={advanced ? 'chevron-down' : 'chevron-right'}
            size={20}
            color={theme.color.text.tertiary}
          />
        </Pressable>

        {advanced ? (
          <View style={{ gap: theme.space[5] }}>
            <View style={{ gap: theme.space[3] }}>
              <Text variant="label" color={theme.color.text.secondary}>
                Security
              </Text>
              <SegmentedControl
                options={SECURITY_OPTIONS}
                value={security}
                onChange={changeSecurity}
                accessibilityLabel="Connection security"
                testIDPrefix="security"
              />
            </View>

            {insecure ? (
              <Banner
                testID="insecure-warning"
                tone="insecure"
                title="Unencrypted connection"
                message="This sends your pairing code and everything else without encryption. Only use it on a network you trust."
                action={warningAction}
              />
            ) : null}

            {!insecure ? (
              <View style={{ gap: theme.space[3] }}>
                <Text variant="label" color={theme.color.text.secondary}>
                  Certificate
                </Text>
                <SegmentedControl
                  options={CERT_OPTIONS}
                  value={cert}
                  onChange={setCert}
                  accessibilityLabel="Certificate type"
                  testIDPrefix="cert"
                />
                <Text variant="caption" color={theme.color.text.tertiary}>
                  Domain and IP certificates are publicly trusted. A private
                  network uses your own network.
                </Text>
              </View>
            ) : null}

            <TextField
              label="Port"
              value={port}
              onChangeText={text => setPort(text.replace(/\D/g, ''))}
              keyboardType="number-pad"
              helper={insecure ? 'Default 80 for plain HTTP.' : 'Default 443 for HTTPS.'}
              inputTestID="port-input"
            />

            <TextField
              label="Device name"
              value={deviceName}
              onChangeText={setDeviceName}
              autoCapitalize="words"
              helper="Shown in the server's device list."
              inputTestID="device-name-input"
            />
          </View>
        ) : null}

        {lastError ? (
          <Banner
            testID="connect-error"
            tone="danger"
            title={lastError.title}
            message={lastError.message}
          />
        ) : null}
      </Screen>

      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title="Use plain HTTP?"
        testID="insecure-sheet">
        <Text variant="body" color={theme.color.text.secondary}>
          Your pairing code and all traffic travel without encryption. Anyone on
          the network could read or change them.
        </Text>
        <View style={{ gap: theme.space[2] }}>
          <Button
            testID="insecure-confirm"
            label="Use plain HTTP"
            variant="destructive"
            onPress={() => {
              setAcknowledged(true);
              setSheetVisible(false);
            }}
          />
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => setSheetVisible(false)}
          />
        </View>
      </BottomSheet>
    </>
  );
}