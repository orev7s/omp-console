import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useAppNavigation, useAppRouteParams } from '../../app/hooks';
import type { SessionParams } from '../../app/navigationTypes';
import { useConnection } from '../../state/connection';
import { useSessions } from '../../state/sessions';
import { Button, Screen, Spinner, Text, TextField } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { MessageBlock } from './components/MessageBlock';
import { TabStrip, type SessionTab } from './components/TabStrip';
import { sessionStateLabel, sessionStateTone } from './sessionState';

/**
 * The live run view. The tab strip switches between open sessions; the active
 * session shows its compact header, transcript, streaming run, and a prompt
 * composer.
 */
export function SessionScreen(): React.JSX.Element {
  const theme = useTheme();
  const navigation = useAppNavigation();
  const params = useAppRouteParams<SessionParams>();

  const connected = useConnection(s => s.realtime.state === 'connected');

  const sessions = useSessions(s => s.sessions);
  const openTabs = useSessions(s => s.openTabs);
  const activeTabId = useSessions(s => s.activeTabId);
  const transcripts = useSessions(s => s.transcripts);
  const busyMap = useSessions(s => s.busy);
  const openSession = useSessions(s => s.openSession);
  const closeTab = useSessions(s => s.closeTab);
  const setActive = useSessions(s => s.setActive);
  const sendPrompt = useSessions(s => s.sendPrompt);
  const abort = useSessions(s => s.abort);

  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (params?.id) openSession(params.id);
  }, [params?.id, openSession]);

  const active = useMemo(
    () => sessions.find(session => session.id === activeTabId) ?? null,
    [sessions, activeTabId],
  );

  const tabs: SessionTab[] = useMemo(
    () =>
      openTabs.map(id => {
        const session = sessions.find(item => item.id === id);
        return { id, title: session ? session.title || session.folder : id };
      }),
    [openTabs, sessions],
  );

  const handleClose = (id: string): void => {
    const remaining = openTabs.filter(tab => tab !== id);
    closeTab(id);
    if (remaining.length === 0) navigation.replace('Sessions');
  };

  const send = async (): Promise<void> => {
    if (!activeTabId) return;
    const text = draft.trim();
    if (text === '') return;
    setDraft('');
    await sendPrompt(activeTabId, text);
  };

  if (!active) {
    return (
      <Screen testID="screen-session">
        <View style={{ alignItems: 'center', gap: theme.space[3], paddingVertical: theme.space[8] }}>
          {params?.id ? (
            <Spinner />
          ) : (
            <>
              <Text variant="bodySmStrong">No session open</Text>
              <Text variant="caption" color={theme.color.text.secondary} align="center">
                Open a session from the landing to see the run here.
              </Text>
              <Button label="Go to sessions" onPress={() => navigation.replace('Sessions')} />
            </>
          )}
        </View>
      </Screen>
    );
  }

  const transcript = transcripts[active.id] ?? [];
  const isBusy = busyMap[active.id] ?? active.state === 'busy';
  const crashed = active.state === 'crashed' || active.state === 'failed';
  const title = active.title || active.folder;
  const tone = sessionStateTone(active.state);
  const stateColor = isBusy
    ? theme.color.accentText
    : tone === 'danger'
      ? theme.color.status.danger
      : theme.color.text.tertiary;

  return (
    <Screen
      testID="screen-session"
      maxWidth={760}
      contentGap={theme.space[5]}
      header={tabs.length > 0 ? <TabStrip tabs={tabs} activeId={activeTabId} onSelect={setActive} onClose={handleClose} /> : undefined}
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space[2] }}>
          <TextField
            label="Message"
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask the agent to do something"
            multiline
            containerStyle={{ flex: 1 }}
            inputTestID="prompt-input"
          />
          <Button
            testID="prompt-send"
            label="Send"
            size="md"
            fullWidth={false}
            disabled={draft.trim() === '' || !connected}
            onPress={() => void send()}
          />
        </View>
      }>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space[3] }}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="bodySmStrong" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" color={theme.color.text.secondary} numberOfLines={1}>
            {active.folder}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 1 }}>
          <Text testID="session-state" variant="caption" color={stateColor}>
            {isBusy ? 'Working' : sessionStateLabel(active.state)}
          </Text>
          {isBusy ? (
            <Text
              testID="session-abort"
              variant="caption"
              color={theme.color.accentText}
              accessibilityRole="button"
              onPress={() => void abort(active.id)}>
              Abort
            </Text>
          ) : null}
        </View>
      </View>

      {crashed ? (
        <View testID="session-error" style={{ gap: theme.space[1] }}>
          <Text variant="bodySmStrong" color={theme.color.status.danger}>
            This session stopped
          </Text>
          <Text variant="caption" color={theme.color.text.secondary}>
            {active.lastError ??
              'The agent stopped unexpectedly. Start a new session or check the server.'}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: theme.space[5] }}>
        {transcript.length === 0 ? (
          <View style={{ gap: 2 }}>
            <Text variant="bodySmStrong">Ready when you are</Text>
            <Text variant="caption" color={theme.color.text.secondary}>
              Send the first prompt below to start the run.
            </Text>
          </View>
        ) : (
          transcript.map(message => <MessageBlock key={message.id} message={message} />)
        )}
      </View>
    </Screen>
  );
}
