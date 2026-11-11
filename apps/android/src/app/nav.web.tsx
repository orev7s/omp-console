import React, { useMemo, useState } from 'react';
import { ConnectScreen } from '../features/connect/ConnectScreen';
import { DebugScreen } from '../features/debug/DebugScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { WelcomeScreen } from '../features/onboarding/WelcomeScreen';
import { PairScreen } from '../features/pair/PairScreen';
import { WebNavContext, type WebNavState } from './hooks.web';
import type { AppNavigation, EntryParams, RootStackParamList, RouteName } from './navigationTypes';

const SCREENS: Record<RouteName, React.ComponentType> = {
  Welcome: WelcomeScreen,
  Connect: ConnectScreen,
  Pair: PairScreen,
  Home: HomeScreen,
  Debug: DebugScreen,
};

interface WebRoute {
  name: RouteName;
  params?: EntryParams;
}

/**
 * Web harness navigator. Renders only the active screen so the browser build
 * has a simple, correct layout. Exposes the same AppNavigation contract.
 */
export function AppNavigator({
  initialRouteName,
}: {
  initialRouteName: RouteName;
  navTheme?: unknown;
}): React.JSX.Element {
  const [stack, setStack] = useState<WebRoute[]>([{ name: initialRouteName }]);

  const navigation = useMemo<AppNavigation>(
    () => ({
      navigate: (name, params) =>
        setStack(current => {
          const existing = current.findIndex(route => route.name === name);
          if (existing >= 0) return current.slice(0, existing + 1);
          return [...current, { name, params: params as EntryParams | undefined }];
        }),
      replace: (name, params) =>
        setStack(current => [
          ...current.slice(0, -1),
          { name, params: params as EntryParams | undefined },
        ]),
      goBack: () => setStack(current => (current.length > 1 ? current.slice(0, -1) : current)),
      reset: state => setStack(state.routes.map(route => ({ name: route.name }))),
    }),
    [],
  );

  const current = stack[stack.length - 1];
  const Screen = SCREENS[current.name];
  const value: WebNavState = { navigation, route: current };

  return (
    <WebNavContext.Provider value={value}>
      <Screen />
    </WebNavContext.Provider>
  );
}

export type { RootStackParamList };