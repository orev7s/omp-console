import React from 'react';
import { View } from 'react-native';
import { useAppNavigation } from '../../app/hooks';
import type { RouteName } from '../../app/navigationTypes';
import { useConnection } from '../../state/connection';
import { BottomSheet, Button, Card, Chip, ListRow, Text } from '../../ui/components';
import { useTheme } from '../../ui/theme';

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * The shell settings: server details, the routes that used to live on Home
 * (Connection, Devices, Activity), and Disconnect. Connection machinery stays
 * off the main path.
 */
export function SettingsSheet({ visible, onClose }: SettingsSheetProps): React.JSX.Element {
  const theme = useTheme();
  const navigation = useAppNavigation();
  const config = useConnection(s => s.config);
  const agent = useConnection(s => s.agent);
  const disconnect = useConnection(s => s.disconnect);

  const insecure = config.mode === 'http';
  const serverName = agent?.name ?? (config.host || 'your server');

  const go = (name: RouteName): void => {
    onClose();
    navigation.navigate(name);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Settings" testID="settings-sheet">
      <View style={{ gap: theme.space[1] }}>
        <Text variant="bodySmStrong" numberOfLines={1}>
          {serverName}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
          <Text variant="caption" color={theme.color.text.secondary}>
            {config.host ? `${config.host}:${config.port}` : 'No server set'}
          </Text>
          {insecure ? (
            <Chip testID="insecure-badge" label="Unencrypted" tone="warning" />
          ) : (
            <Chip testID="secure-badge" label="Secure" tone="neutral" />
          )}
        </View>
      </View>

      <Card style={{ padding: 0 }}>
        <View style={{ paddingHorizontal: theme.space[4] }}>
          <ListRow
            testID="connection-link"
            title="Connection"
            subtitle="Change address, mode, or network"
            onPress={() => go('Connect')}
            dense
          />
          <ListRow
            testID="devices-link"
            title="Devices"
            subtitle="Phones paired to this server"
            onPress={() => go('Devices')}
            dense
          />
          <ListRow
            testID="debug-link"
            title="Activity"
            subtitle="Connection log and test message"
            onPress={() => go('Debug')}
            divider={false}
            dense
          />
        </View>
      </Card>

      <Button
        testID="disconnect-button"
        label="Disconnect"
        variant="secondary"
        onPress={() => {
          disconnect();
          onClose();
        }}
      />
    </BottomSheet>
  );
}
