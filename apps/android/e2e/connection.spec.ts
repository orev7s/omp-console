import { expect, test } from '@playwright/test';

/**
 * End to end through the real UI, in a browser, against the real control plane
 * through Caddy over HTTPS and WSS. The phone viewport and Inter/JetBrains Mono
 * are the shipping target. No APK and no emulator are involved: the browser is
 * a supported way to use the console, not only a test harness.
 */
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const ARTIFACTS = 'e2e/artifacts';

async function reset(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}



test('onboards from welcome to connected, then shows the activity log', async ({ page }) => {
  await reset(page);
  expect(new URL(page.url()).protocol).toBe('https:');

  // Welcome, in both themes.
  await expect(page.getByTestId('screen-welcome')).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/welcome-light.png` });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: `${ARTIFACTS}/welcome-dark.png` });
  await page.emulateMedia({ colorScheme: 'light' });

  // Connect over HTTPS to the Caddy origin.
  await page.getByTestId('welcome-primary').click();
  await expect(page.getByTestId('screen-connect')).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/connect-light.png` });
  await page.getByTestId('server-address-input').fill('localhost:8443');
  await page.getByTestId('advanced-toggle').click();
  await page.screenshot({ path: `${ARTIFACTS}/connect-advanced-light.png` });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: `${ARTIFACTS}/connect-advanced-dark.png` });
  await page.emulateMedia({ colorScheme: 'light' });

  await page.getByTestId('connect-continue').click();

  // Pair.
  await expect(page.getByTestId('screen-pair')).toBeVisible();
  await page.getByTestId('pair-code-input').fill('TESTCODE');
  await page.screenshot({ path: `${ARTIFACTS}/pair-light.png` });
  await page.getByTestId('pair-button').click();

  // Home, connected over the secure mode.
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('status-label')).toContainText(/connected/i);
  await expect(page.getByTestId('secure-badge')).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/home-light.png` });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: `${ARTIFACTS}/home-dark.png` });
  await page.emulateMedia({ colorScheme: 'light' });

  // Debug: the raw log lives here now, and the echo round trips.
  await page.getByTestId('debug-link').click();
  await expect(page.getByTestId('screen-debug')).toBeVisible();
  await expect(page.getByText(/over HTTPS/i).first()).toBeVisible();
  await expect(page.getByText(/hello from/i)).toBeVisible();
  await expect(page.getByText(/event server\.status/i)).toBeVisible();
  await expect(page.getByTestId('echo-button')).toBeEnabled();
  await page.getByTestId('echo-button').click();
  await expect(page.getByText(/response c\d+ ok/i).first()).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/debug-light.png` });
});

test('shows the insecure warning only when plain HTTP is chosen', async ({ page }) => {
  await reset(page);

  await expect(page.getByTestId('insecure-warning')).toHaveCount(0);
  await page.getByTestId('welcome-primary').click();
  await expect(page.getByTestId('screen-connect')).toBeVisible();
  await expect(page.getByTestId('insecure-warning')).toHaveCount(0);

  await page.getByTestId('advanced-toggle').click();
  await expect(page.getByTestId('insecure-warning')).toHaveCount(0);

  await page.getByTestId('security-http').click();
  await expect(page.getByTestId('insecure-warning')).toBeVisible();

  await page.getByTestId('security-secure').click();
  await expect(page.getByTestId('insecure-warning')).toHaveCount(0);
});

test('keeps Continue disabled until plain HTTP is acknowledged', async ({ page }) => {
  await reset(page);
  await page.getByTestId('welcome-primary').click();
  await page.getByTestId('server-address-input').fill('localhost:8443');
  await page.getByTestId('advanced-toggle').click();
  await page.getByTestId('security-http').click();
  await expect(page.getByTestId('connect-continue')).toBeDisabled();
  await page.getByTestId('insecure-ack').click();
  await page.getByTestId('insecure-confirm').click();
  await expect(page.getByTestId('connect-continue')).toBeEnabled();
});

test('shows a friendly error for a wrong pairing code', async ({ page }) => {
  await reset(page);
  await page.getByTestId('welcome-primary').click();
  await page.getByTestId('server-address-input').fill('localhost:8443');
  await page.getByTestId('connect-continue').click();

  await expect(page.getByTestId('screen-pair')).toBeVisible();
  await page.getByTestId('pair-code-input').fill('WRONG123');
  await page.getByTestId('pair-button').click();

  const error = page.getByTestId('pair-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText(/not accepted/i);
  await expect(page.getByTestId('screen-home')).toHaveCount(0);
});