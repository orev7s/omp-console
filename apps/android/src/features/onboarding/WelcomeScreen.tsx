import React from 'react';
import { View } from 'react-native';
import { useAppNavigation } from '../../app/hooks';
import { BrandMark, Button, Screen, Text } from '../../ui/components';
import { useTheme } from '../../ui/theme';

export function WelcomeScreen(): React.JSX.Element {
  const theme = useTheme();
  const navigation = useAppNavigation();

  return (
    <Screen
      testID="screen-welcome"
      contentStyle={{ paddingTop: theme.space[10] }}
      footer={
        <>
          <Button
            testID="welcome-primary"
            label="Connect to my server"
            onPress={() => navigation.navigate('Connect')}
          />
          <Button
            testID="welcome-have-code"
            label="I already have a code"
            variant="ghost"
            size="md"
            onPress={() => navigation.navigate('Pair')}
          />
        </>
      }>
      <View style={{ gap: theme.space[5] }}>
        <BrandMark size={64} />
        <Text variant="display">Reach your agent from your phone</Text>
        <Text variant="body" color={theme.color.text.secondary}>
          Connect this phone to the server you run. One address, one code, then
          you are in.
        </Text>
      </View>
    </Screen>
  );
}