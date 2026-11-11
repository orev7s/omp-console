import { useNavigation, useRoute } from '@react-navigation/native';
import type { AppNavigation } from './navigationTypes';

/** Native navigation hooks, backed by React Navigation. */
export function useAppNavigation(): AppNavigation {
  return useNavigation() as unknown as AppNavigation;
}

export function useAppRouteParams<T>(): T | undefined {
  return useRoute().params as T | undefined;
}