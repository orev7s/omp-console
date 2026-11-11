import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useAppNavigation } from '../../app/hooks';
import { useConnection } from '../../state/connection';
import {
  Banner,
  Button,
  Card,
  Chip,
  ListRow,
  Screen,
  StatusIndicator,
  Text,
  type StatusState,
} from '../../ui/components';
import { useTheme } from '../../ui/theme';

function agentLabel(agentState: string): string {
  switch (agentState) {
    case 'unavailable':
      return 'Not set up yet';
    case 'ready':
      return 'Ready';
    case 'busy':
      return 'Working';
    case 'starting':
      return 'Starting';
    case 'stopped':
      return 'Stopped';
    case 'crashed':
      return 'Crashed';
    default:
      return agentState;
  }
}

export function HomeScreen(): React.JSX.Element {
  const theme = useTheme();
  const navigation = useAppNavigation();

  const config = useConnection(s => s.config);
  const token = useConnection(s => s.token);
  const agent = useConnection(s => s.agent);
  const realtime = useConnection(s => s.realtime);
  const lastError = useConnection(s => s.lastError);
  const connect = useConnection(s => s.connect);
  const disconnect = useConnection(s => s.disconnect);

  const attempted = useRef(false);
  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    if (token && config.host && realtime.state === 'idle') void connect();
  }, [token, config.host, realtime.state, connect]);

  const connected = realtime.state === 'connected';
  const connecting = realtime.state === 'connecting' || realtime.state === 'reconnecting';
  const state: StatusState = connected ? 'live' : connecting ? 'connecting' : lastError ? 'error' : 'offline';

  const serverName = agent?.name ?? config.host ?? 'your server';
  const sentence = connected
    ? `You are connected to ${serverName}`
    : connecting
      ? 'Connecting to your server'
      : lastError
        ? 'Cannot reach your server'
        : 'Not connected';

  const insecure = config.mode === 'http';

  return (
    <Screen
      testID="screen-home"
      contentStyle={{ paddingTop: theme.space[8] }}
      footer={
        connected || connecting ? (
          <Button
            testID="disconnect-button"
            label="Disconnect"
            variant="secondary"
            onPress={disconnect}
          />
        ) : (
          <Button
            testID="retry-button"
            label="Try again"
            onPress={() => void connect()}
          />
        )
      }>
      <View style={{ gap: theme.space[4] }}>
        <StatusIndicator testID="status-label" state={state} label={sentence} size="hero" />
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

      {lastError && !connected ? (
        <Banner testID="home-error" tone="danger" title={lastError.title} message={lastError.message} />
      ) : null}

      <Card style={{ gap: 0 }}>
        <ListRow title="Server" value={serverName} />
        <ListRow title="Address" value={config.host ? `${config.host}:${config.port}` : 'Not set'} />
        <ListRow title="Agent" value={agent ? agentLabel(agent.agentState) : 'Unknown'} divider={false} />
      </Card>

      {connected && agent?.agentState === 'unavailable' ? (
        <Banner
          testID="home-info"
          tone="info"
          message="Sessions and monitoring are coming in a later update. For now, the connection is live."
        />
      ) : null}

      <Card style={{ padding: 0 }}>
        <View style={{ paddingHorizontal: theme.space[5] }}>
          <ListRow
            testID="debug-link"
            title="Activity"
            subtitle="Connection log and test message"
            onPress={() => navigation.navigate('Debug')}
            divider={false}
            showChevron
          />
        </View>
      </Card>
    </Screen>
  );
}