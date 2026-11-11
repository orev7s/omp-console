import { createContext, useContext } from 'react';
import type { AppNavigation, EntryParams, RouteName } from './navigationTypes';

export interface WebNavState {
  navigation: AppNavigation;
  route: { name: RouteName; params?: EntryParams };
}

/**
 * Web harness navigation. React Navigation's native-stack needs a native screen
 * container and does not lay out under react-native-web, so the browser build
 * uses this small in-memory stack instead. Same hooks, same contract.
 */
export const WebNavContext = createContext<WebNavState | null>(null);

export function useAppNavigation(): AppNavigation {
  const ctx = useContext(WebNavContext);
  if (!ctx) throw new Error('useAppNavigation used outside the web navigator');
  return ctx.navigation;
}

export function useAppRouteParams<T>(): T | undefined {
  const ctx = useContext(WebNavContext);
  return ctx?.route.params as T | undefined;
}