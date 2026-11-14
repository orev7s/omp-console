import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useAppNavigation } from '../../app/hooks';
import { useConnection } from '../../state/connection';
import { useDevices } from '../../state/devices';
import { Banner, Button, Screen, Spinner, Text } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { DeviceCard } from './DeviceCard';

export function DevicesScreen(): React.JSX.Element {
  const theme = useTheme();
  const navigation = useAppNavigation();

  const token = useConnection(s => s.token);
  const devices = useDevices(s => s.devices);
  const loading = useDevices(s => s.loading);
  const busyId = useDevices(s => s.busyId);
  const error = useDevices(s => s.error);
  const refresh = useDevices(s => s.refresh);
  const rename = useDevices(s => s.rename);
  const revoke = useDevices(s => s.revoke);
  const rotate = useDevices(s => s.rotate);
  const clearError = useDevices(s => s.clearError);

  useEffect(() => {
    if (token) void refresh();
  }, [token, refresh]);

  return (
    <Screen
      testID="screen-devices"
      title="Devices"
      subtitle="Phones paired to this server. Rename one, revoke a lost phone, or rotate this phone's token."
      onBack={() => navigation.goBack()}
      footer={
        <Button
          testID="devices-refresh"
          label="Refresh"
          variant="secondary"
          loading={loading}
          onPress={() => void refresh()}
        />
      }>
      {error ? (
        <Banner
          testID="devices-error"
          tone="danger"
          title={error.title}
          message={error.message}
          action={
            <Button
              label="Dismiss"
              size="sm"
              variant="ghost"
              fullWidth={false}
              onPress={clearError}
            />
          }
        />
      ) : null}

      {!token ? (
        <Banner
          tone="warning"
          title="Not connected"
          message="Pair this phone and connect before managing devices."
        />
      ) : loading && devices.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: theme.space[8] }}>
          <Spinner />
        </View>
      ) : devices.length === 0 ? (
        <Banner tone="info" message="No devices are paired yet." />
      ) : (
        <View style={{ gap: theme.space[3] }}>
          {devices.map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              busy={busyId === device.id}
              onRename={name => rename(device.id, name)}
              onRevoke={() => revoke(device.id)}
              onRotate={() => rotate(device.id)}
            />
          ))}
        </View>
      )}

      <Text variant="caption" color={theme.color.text.tertiary}>
        Revoking signs a phone out right away. Rotating this device's token
        replaces the credential stored here; other phones keep theirs.
      </Text>
    </Screen>
  );
}