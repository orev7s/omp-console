import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAppNavigation } from '../../app/hooks';
import { useConnection } from '../../state/connection';
import { groupSessionsByRecency } from '../../state/sessionTime';
import { useSessions } from '../../state/sessions';
import {
  BottomSheet,
  BrandMark,
  Button,
  SectionHeader,
  Screen,
  StatusIndicator,
  Text,
  TextField,
} from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { SettingsSheet } from '../settings/SettingsSheet';
import { liveStatus } from './connectionStatus';
import { ProjectRow } from './components/ProjectRow';
import { SessionRow } from './components/SessionRow';

/**
 * The session-first landing. A quiet centered header (brand mark plus the live
 * server state), then recent sessions grouped by recency and the registered
 * projects. New session is the single primary action in the footer.
 */
export function SessionsScreen(): React.JSX.Element {
  const theme = useTheme();
  const navigation = useAppNavigation();

  const config = useConnection(s => s.config);
  const token = useConnection(s => s.token);
  const agent = useConnection(s => s.agent);
  const realtime = useConnection(s => s.realtime);
  const connectionError = useConnection(s => s.lastError);
  const connect = useConnection(s => s.connect);

  const projects = useSessions(s => s.projects);
  const sessions = useSessions(s => s.sessions);
  const creating = useSessions(s => s.creating);
  const sessionError = useSessions(s => s.lastError);
  const refreshProjects = useSessions(s => s.refreshProjects);
  const refreshSessions = useSessions(s => s.refreshSessions);
  const addProject = useSessions(s => s.addProject);
  const removeProject = useSessions(s => s.removeProject);
  const createSession = useSessions(s => s.createSession);
  const openSession = useSessions(s => s.openSession);
  const clearError = useSessions(s => s.clearError);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [projectPath, setProjectPath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [adding, setAdding] = useState(false);

  const attempted = useRef(false);
  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    if (token && config.host && realtime.state === 'idle') void connect();
  }, [token, config.host, realtime.state, connect]);

  useEffect(() => {
    if (!token) return;
    void refreshProjects();
    void refreshSessions();
  }, [token, refreshProjects, refreshSessions]);

  const status = liveStatus(
    realtime,
    connectionError,
    agent?.name || config.host || 'your server',
  );
  const groups = groupSessionsByRecency(sessions);

  const startSession = async (): Promise<void> => {
    const first = projects[0];
    const session = await createSession(first ? { projectId: first.id } : {});
    if (session) navigation.navigate('Session', { id: session.id });
  };

  const openExisting = (id: string): void => {
    openSession(id);
    navigation.navigate('Session', { id });
  };

  const submitProject = async (): Promise<void> => {
    if (projectPath.trim() === '') return;
    setAdding(true);
    const ok = await addProject(projectPath, projectName.trim() || undefined);
    setAdding(false);
    if (ok) {
      setProjectPath('');
      setProjectName('');
      setAddOpen(false);
    }
  };

  return (
    <>
      <Screen
        testID="screen-sessions"
        maxWidth={560}
        contentGap={theme.space[6]}
        footer={
          <Button
            testID="new-session"
            label="New session"
            loading={creating}
            onPress={() => void startSession()}
          />
        }>
        <View style={{ alignItems: 'center', gap: theme.space[4], paddingTop: theme.space[4] }}>
          <BrandMark size={48} />
          <Pressable
            testID="sessions-settings"
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => setSettingsOpen(true)}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <StatusIndicator
              testID="status-label"
              state={status.state}
              label={status.sentence}
              size="compact"
            />
          </Pressable>
        </View>

        {connectionError && !status.connected ? (
          <View testID="sessions-error" style={{ gap: theme.space[1] }}>
            <Text variant="bodySmStrong" color={theme.color.status.danger}>
              {connectionError.title}
            </Text>
            <Text variant="caption" color={theme.color.text.secondary}>
              {connectionError.message}
            </Text>
            <Text
              variant="caption"
              color={theme.color.accentText}
              accessibilityRole="button"
              onPress={() => void connect()}>
              Try again
            </Text>
          </View>
        ) : null}

        {sessionError ? (
          <View testID="sessions-session-error" style={{ gap: theme.space[1] }}>
            <Text variant="bodySmStrong" color={theme.color.status.danger}>
              {sessionError.title}
            </Text>
            <Text variant="caption" color={theme.color.text.secondary}>
              {sessionError.message}
            </Text>
            <Text
              variant="caption"
              color={theme.color.accentText}
              accessibilityRole="button"
              onPress={clearError}>
              Dismiss
            </Text>
          </View>
        ) : null}

        <View style={{ gap: theme.space[2] }}>
          <SectionHeader label="Recent sessions" />
          {sessions.length === 0 ? (
            <View style={{ gap: 2 }}>
              <Text variant="bodySmStrong">No sessions yet</Text>
              <Text variant="caption" color={theme.color.text.secondary}>
                Start a session and watch the agent work in one of your projects. It shows up here.
              </Text>
            </View>
          ) : (
            groups.map(group => (
              <View key={group.label} style={{ gap: theme.space[1], paddingTop: theme.space[1] }}>
                <Text variant="caption" color={theme.color.text.tertiary}>
                  {group.label}
                </Text>
                <View>
                  {group.sessions.map((session, index) => (
                    <SessionRow
                      key={session.id}
                      testID={`session-row-${session.id}`}
                      title={session.title || session.folder}
                      folder={session.folder}
                      state={session.state}
                      updatedAt={session.updatedAt}
                      divider={index < group.sessions.length - 1}
                      onPress={() => openExisting(session.id)}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ gap: theme.space[2] }}>
          <SectionHeader
            label="Projects"
            action={
              <Text
                testID="add-project-open"
                variant="caption"
                color={theme.color.accentText}
                accessibilityRole="button"
                onPress={() => setAddOpen(true)}>
                Add project
              </Text>
            }
          />
          {projects.length === 0 ? (
            <Text variant="caption" color={theme.color.text.tertiary}>
              No projects yet. Add one so sessions run in a folder you own.
            </Text>
          ) : (
            <View>
              {projects.map((project, index) => (
                <ProjectRow
                  key={project.id}
                  name={project.name}
                  path={project.path}
                  onRemove={() => void removeProject(project.id)}
                  divider={index < projects.length - 1}
                />
              ))}
            </View>
          )}
        </View>
      </Screen>

      <BottomSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add project"
        testID="add-project-sheet">
        <TextField
          label="Folder path"
          value={projectPath}
          onChangeText={setProjectPath}
          placeholder="/home/you/code/project"
          autoCapitalize="none"
          autoCorrect={false}
          helper="An absolute path on your server."
          inputTestID="project-path-input"
        />
        <TextField
          label="Name (optional)"
          value={projectName}
          onChangeText={setProjectName}
          placeholder="project"
          inputTestID="project-name-input"
        />
        <View style={{ gap: theme.space[2] }}>
          <Button
            testID="add-project-confirm"
            label="Add project"
            loading={adding}
            disabled={projectPath.trim() === ''}
            onPress={() => void submitProject()}
          />
          <Button label="Cancel" variant="ghost" onPress={() => setAddOpen(false)} />
        </View>
      </BottomSheet>

      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
