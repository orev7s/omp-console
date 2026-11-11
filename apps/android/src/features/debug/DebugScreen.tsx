import React, { useState } from 'react';
import { View } from 'react-native';
import { useAppNavigation } from '../../app/hooks';
import { useConnection } from '../../state/connection';
import {
  Button,
  Card,
  Screen,
  Text,
  TextField,
} from '../../ui/components';
import { useTheme } from '../../ui/theme';

function Fact({ label, value }: { label: string; value: string }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[1] }}>
      <Text variant="monoLabel" color={theme.color.text.tertiary}>
        {label}
      </Text>
      <Text variant="mono" color={theme.color.text.primary}>
        {value}
      </Text>
    </View>
  );
}

export function DebugScreen(): React.JSX.Element {
  const theme = useTheme();
  const navigation = useAppNavigation();

  const config = useConnection(s => s.config);
  const agent = useConnection(s => s.agent);
  const log = useConnection(s => s.log);
  const realtime = useConnection(s => s.realtime);
  const sendEcho = useConnection(s => s.sendEcho);
  const clearLog = useConnection(s => s.clearLog);
  const forgetDevice = useConnection(s => s.forgetDevice);

  const [echo, setEcho] = useState('hello from phone');
  const connected = realtime.state === 'connected';

  const forget = async (): Promise<void> => {
    await forgetDevice();
    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  };

  return (
    <Screen
      testID="screen-debug"
      title="Activity"
      subtitle="Everything technical, kept off the main path."
      onBack={() => navigation.goBack()}>
      <Card>
        <Fact label="Server" value={agent?.name ?? 'Not known yet'} />
        <Fact label="Version" value={agent?.version ?? 'Not known yet'} />
        <Fact label="Agent" value={agent?.agentState ?? 'unknown'} />
        <Fact label="Address" value={config.host ? `${config.host}:${config.port}` : 'Not set'} />
        <Fact label="Server id" value={agent?.serverId ?? 'Not known yet'} />
        <Fact label="Socket" value={realtime.state} />
      </Card>

      <View style={{ gap: theme.space[3] }}>
        <TextField
          label="Test message"
          value={echo}
          onChangeText={setEcho}
          inputTestID="echo-input"
        />
        <Button
          testID="echo-button"
          label="Send test message"
          variant="secondary"
          size="md"
          fullWidth={false}
          disabled={!connected}
          onPress={() => sendEcho(echo)}
        />
      </View>

      <View style={{ gap: theme.space[2] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          <Text variant="label" color={theme.color.text.secondary}>
            Connection log
          </Text>
          {log.length > 0 ? (
            <Text
              variant="caption"
              color={theme.color.accentText}
              accessibilityRole="button"
              onPress={clearLog}>
              Clear
            </Text>
          ) : null}
        </View>
        <Card testID="event-log">
          {log.length === 0 ? (
            <Text variant="mono" color={theme.color.text.tertiary}>
              No activity yet.
            </Text>
          ) : (
            log.slice(0, 40).map((entry, index) => (
              <Text
                key={`${entry.at}-${index}`}
                variant="mono"
                color={theme.color.text.secondary}>
                {new Date(entry.at).toLocaleTimeString()} {entry.text}
              </Text>
            ))
          )}
        </Card>
      </View>

      <Button
        testID="forget-button"
        label="Forget this device"
        variant="destructive"
        size="md"
        fullWidth={false}
        onPress={() => void forget()}
      />
    </Screen>
  );
}