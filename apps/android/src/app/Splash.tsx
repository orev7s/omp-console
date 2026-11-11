import React from 'react';
import { View } from 'react-native';
import { BrandMark, Spinner } from '../ui/components';
import { useTheme } from '../ui/theme';

/** Shown for the moment the store needs to hydrate. Brand symbol, no words. */
export function Splash(): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      testID="screen-splash"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space[8],
        backgroundColor: theme.color.bg.canvas,
      }}>
      <BrandMark size={72} />
      <Spinner size="small" />
    </View>
  );
}