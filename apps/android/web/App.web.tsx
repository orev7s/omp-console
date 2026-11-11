import React from 'react';
import { AppShell } from '../src/app/AppShell';

/**
 * Web harness root. Renders the same shell as the app so Playwright drives the
 * real screens, navigation, theme, and store.
 */
export default function App(): React.JSX.Element {
  return <AppShell />;
}