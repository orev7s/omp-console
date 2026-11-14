import React, { useEffect, useMemo } from 'react';
import { StatusBar } from 'react-native';
import { DarkTheme, DefaultTheme, type Theme as NavTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useConnection } from '../state/connection';
import { useTheme } from '../ui/theme';
import { AppNavigator } from './nav';
import { Splash } from './Splash';

/**
 * The app shell: theme, status bar, and navigation. `App.tsx` stays thin by
 * delegating everything here. The web harness renders this same shell.
 */
export function AppShell(): React.JSX.Element {
  const theme = useTheme();
  const hydrated = useConnection(s => s.hydrated);
  const token = useConnection(s => s.token);
  const host = useConnection(s => s.config.host);
  const initialize = useConnection(s => s.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const navTheme: NavTheme = useMemo(() => {
    const base = theme.mode === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.color.accent,
        background: theme.color.bg.canvas,
        card: theme.color.bg.card,
        text: theme.color.text.primary,
        border: theme.color.border.hairline,
        notification: theme.color.status.danger,
      },
    };
  }, [theme]);

  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />
      {hydrated ? (
        <AppNavigator initialRouteName={token && host ? 'Sessions' : 'Welcome'} navTheme={navTheme} />
      ) : (
        <Splash />
      )}
    </SafeAreaProvider>
  );
}