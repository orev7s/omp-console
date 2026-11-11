import type { ConnectionMode } from '@omp-console/protocol';

/**
 * Route params accept the pieces a future QR code or installer deep link would
 * carry, so `ompconsole://connect?host=..` and `ompconsole://pair?host=..&code=..`
 * can drop into the right screen without reshaping the flow.
 */
export interface EntryParams {
  host?: string;
  port?: number;
  mode?: ConnectionMode;
  code?: string;
}

export type RootStackParamList = {
  Welcome: undefined;
  Connect: EntryParams | undefined;
  Pair: EntryParams | undefined;
  Home: undefined;
  Debug: undefined;
};

export type RouteName = keyof RootStackParamList;

/**
 * The navigation surface screens use. The native build backs this with React
 * Navigation; the web harness backs it with a small in-memory stack so the
 * browser build carries no native screen container. Screens only ever see this.
 */
export interface AppNavigation {
  navigate<T extends RouteName>(name: T, params?: RootStackParamList[T]): void;
  replace<T extends RouteName>(name: T, params?: RootStackParamList[T]): void;
  goBack(): void;
  reset(state: { index: number; routes: Array<{ name: RouteName }> }): void;
}