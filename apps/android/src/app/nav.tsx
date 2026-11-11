import React from 'react';
import {
  NavigationContainer,
  type LinkingOptions,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ConnectScreen } from '../features/connect/ConnectScreen';
import { DebugScreen } from '../features/debug/DebugScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { WelcomeScreen } from '../features/onboarding/WelcomeScreen';
import { PairScreen } from '../features/pair/PairScreen';
import type { RootStackParamList, RouteName } from './navigationTypes';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['ompconsole://'],
  config: {
    screens: {
      Welcome: '',
      Connect: 'connect',
      Pair: 'pair',
      Home: 'home',
      Debug: 'debug',
    },
  },
};

/** Native navigator: React Navigation native-stack, with deep-link readiness. */
export function AppNavigator({
  initialRouteName,
  navTheme,
}: {
  initialRouteName: RouteName;
  navTheme: NavTheme;
}): React.JSX.Element {
  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: navTheme.colors.background },
          animation: 'slide_from_right',
        }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Connect" component={ConnectScreen} />
        <Stack.Screen name="Pair" component={PairScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Debug" component={DebugScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}