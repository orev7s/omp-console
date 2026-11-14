/**
 * Screenshot harness for the OMP Console browser build.
 *
 * Plain Node ESM. It does not start a server and does not use the Playwright
 * test runner. Point it at an already-running trial and it drives the real UI:
 * onboarding, pairing (plain HTTP), the sessions landing, and a session
 * transcript. PNGs land in OUT_DIR.
 *
 * Env:
 *   BASE_URL   origin of the running web build. Default http://127.0.0.1:8090
 *   PAIR_CODE  single-use pairing code from the installer. Required to pair.
 *   OUT_DIR    where PNGs are written. Default ./e2e/artifacts/shots
 *   KEEP_SESSION=1   do not clear localStorage first (reuse an existing pairing)
 *   SKIP_DARK=1      do not capture dark variants
 *   DISABLE_SANDBOX=1  launch chromium with --no-sandbox (some VPS kernels)
 *
 * Invoke from apps/android:
 *   BASE_URL=http://127.0.0.1:8090 PAIR_CODE=ABCD-1234 node e2e/screenshot.mjs
 * or:
 *   BASE_URL=... PAIR_CODE=... npm run shots
 *
 * The app has no in-app theme switch. Dark mode follows the OS color scheme
 * (react-native `useColorScheme`), so dark variants are captured the same way
 * the existing e2e spec does: `page.emulateMedia({ colorScheme: 'dark' })`.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:8090';
const PAIR_CODE = process.env.PAIR_CODE ?? '';
const OUT_DIR = path.resolve(process.cwd(), process.env.OUT_DIR ?? './e2e/artifacts/shots');
const KEEP_SESSION = process.env.KEEP_SESSION === '1';
const SKIP_DARK = process.env.SKIP_DARK === '1';

const VIEWPORT = { width: 390, height: 844 };
const NAV_TIMEOUT = 30_000;
const STEP_TIMEOUT = 20_000;
const PROMPT =
  'Create a file NOTES.md in this folder with a short markdown summary: a heading, a two-item bulleted list, and a fenced code block. Then read the file back and show its contents.';

/** Skip sending a prompt; capture the transcript already on screen. */
const SKIP_PROMPT = process.env.SKIP_PROMPT === '1';
/** Seed the stored device token and server config to skip onboarding. */
const PREAUTH_TOKEN = process.env.PREAUTH_TOKEN ?? '';
const PREAUTH_HOST = process.env.PREAUTH_HOST ?? '';
const PREAUTH_PORT = Number(process.env.PREAUTH_PORT ?? '8090');
const PREAUTH_MODE = process.env.PREAUTH_MODE ?? 'http';

/** Files written this run, for the closing summary. */
const written = [];
/** Current step, so a thrown error names where it failed. */
let step = 'startup';

function log(message) {
  process.stdout.write(`[shots] ${message}\n`);
}

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  written.push(file);
  log(`saved ${path.relative(process.cwd(), file)}`);
}

async function isVisible(locator, timeout = 0) {
  if (timeout > 0) {
    await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  }
  return locator.isVisible().catch(() => false);
}

/** Wait for a control by testID, with visible-text fallbacks. */
async function waitEither(page, testId, texts, timeout = STEP_TIMEOUT) {
  let loc = page.getByTestId(testId);
  for (const text of texts) {
    loc = loc.or(page.getByText(text, { exact: false }));
  }
  await loc.first().waitFor({ state: 'visible', timeout });
}

/** Click a control by testID, falling back to visible-text matchers. */
async function clickEither(page, testId, texts, timeout = STEP_TIMEOUT) {
  const byId = page.getByTestId(testId).first();
  if (await byId.isVisible().catch(() => false)) {
    await byId.click({ timeout });
    return;
  }
  for (const text of texts) {
    const loc = page.getByText(text, { exact: false }).first();
    if (await loc.isVisible().catch(() => false)) {
      await loc.click({ timeout });
      return;
    }
  }
  throw new Error(
    `could not find control: testID "${testId}" or text ${JSON.stringify(texts)}`,
  );
}

/** Fill an input by testID, falling back to a labelled textbox. */
async function fillEither(page, testId, texts, value, timeout = STEP_TIMEOUT) {
  const byId = page.getByTestId(testId).first();
  if (await byId.isVisible().catch(() => false)) {
    await byId.fill(value, { timeout });
    return;
  }
  for (const text of texts) {
    const loc = page.getByLabel(text, { exact: false }).first();
    if (await loc.isVisible().catch(() => false)) {
      await loc.fill(value, { timeout });
      return;
    }
  }
  throw new Error(`could not find input: testID "${testId}" or label ${JSON.stringify(texts)}`);
}

/** Scroll the scrollable region inside a screen to a fraction of its height. */
async function scrollScreenFraction(page, testId, fraction) {
  return page.evaluate(
    ({ testId: id, fraction: f }) => {
      const root = document.querySelector(`[data-testid="${id}"]`);
      if (!root) return false;
      const candidates = [root, ...root.querySelectorAll('*')].filter(el => {
        const style = getComputedStyle(el);
        const scrollable = /(auto|scroll)/.test(`${style.overflowY}${style.overflow}`);
        return scrollable && el.scrollHeight > el.clientHeight + 8;
      });
      const target = candidates.length > 0 ? candidates[candidates.length - 1] : null;
      if (!target) return false;
      target.scrollTop = Math.max(0, (target.scrollHeight - target.clientHeight) * f);
      return true;
    },
    { testId, fraction },
  );
}

async function screenText(page, testId) {
  return page.getByTestId(testId).innerText().catch(() => '');
}

/**
 * Best-effort wait for the transcript to change from its pre-prompt text and
 * then settle. Returns instead of throwing when nothing arrives, so a server
 * without a live agent still produces a screenshot.
 */
async function waitForTranscript(page, before, timeout = 30_000, settle = 1_200) {
  const start = Date.now();
  let last = before;
  let lastChange = Date.now();
  while (Date.now() - start < timeout) {
    const now = await screenText(page, 'screen-session');
    if (now !== last) {
      last = now;
      lastChange = Date.now();
    } else if (now !== before && Date.now() - lastChange >= settle) {
      return true;
    }
    await page.waitForTimeout(400);
  }
  log('transcript did not settle in time, capturing what is on screen');
  return false;
}

async function captureDark(page, name, body) {
  if (SKIP_DARK) return;
  try {
    await page.emulateMedia({ colorScheme: 'dark' });
    await body();
    await shot(page, name);
  } catch (err) {
    log(`dark capture skipped: ${err.message}`);
  } finally {
    await page.emulateMedia({ colorScheme: 'light' }).catch(() => {});
  }
}

/** Onboarding plus pairing up to the sessions landing. Returns once paired. */
async function pair(page, origin) {
  const welcome = page.getByTestId('screen-welcome');
  if (!(await isVisible(welcome, 10_000))) {
    step = 'already paired';
    log('no welcome screen; the device is already paired, skipping onboarding');
    return;
  }

  step = 'capture onboarding';
  await shot(page, '01-welcome');

  step = 'open connect';
  await clickEither(page, 'welcome-primary', ['Connect to my server']);
  await waitEither(page, 'screen-connect', ['Connect to your server']);
  await shot(page, '02-connect');

  step = 'enter address';
  const address = origin.port ? `${origin.hostname}:${origin.port}` : origin.hostname;
  await fillEither(page, 'server-address-input', ['Server address'], address);

  step = 'open advanced';
  await clickEither(page, 'advanced-toggle', ['Advanced']);

  if (origin.protocol === 'http:') {
    step = 'choose plain HTTP';
    await clickEither(page, 'security-http', ['Plain HTTP']);
    await waitEither(page, 'insecure-warning', ['Unencrypted connection']);
    step = 'acknowledge plain HTTP';
    await clickEither(page, 'insecure-ack', ['I understand the risk']);
    await clickEither(page, 'insecure-confirm', ['Use plain HTTP']);
    await waitEither(page, 'insecure-confirmed', ['Plain HTTP confirmed']);
  } else {
    log('BASE_URL is https, keeping the default secure mode');
  }

  await shot(page, '03-connect-advanced');

  step = 'continue to pair';
  await clickEither(page, 'connect-continue', ['Continue']);
  await waitEither(page, 'screen-pair', ['Pair your device']);

  if (PAIR_CODE.trim() === '') {
    throw new Error('PAIR_CODE is required to pair this device (set the env var)');
  }

  step = 'enter pairing code';
  await fillEither(page, 'pair-code-input', ['Pairing code'], PAIR_CODE);
  await shot(page, '04-pair');

  step = 'pair device';
  await clickEither(page, 'pair-button', ['Pair device']);

  await Promise.race([
    page.getByTestId('screen-sessions').waitFor({ state: 'visible', timeout: 30_000 }),
    page
      .getByTestId('pair-error')
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(async () => {
        const text = (await screenText(page, 'pair-error')).trim();
        throw new Error(`pairing was rejected by the server: ${text}`);
      }),
  ]);
}

/** Open the first session, or create one, then capture the transcript. */
async function captureChat(page) {
  step = 'sessions landing';
  await waitEither(page, 'screen-sessions', ['Recent sessions']);
  await shot(page, '05-sessions');
  await captureDark(page, '05-sessions-dark', async () => {
    await page.waitForTimeout(250);
  });

  step = 'open session';
  const firstRow = page.locator('[data-testid^="session-row-"]').first();
  const hasRow = await isVisible(firstRow, 6_000);
  if (hasRow) {
    await firstRow.click();
  } else {
    log('no session rows, creating a new session');
    await clickEither(page, 'new-session', ['New session']);
  }

  const opened = await isVisible(page.getByTestId('screen-session'), 20_000);
  if (!opened) {
    log('session view did not open, skipping chat shots');
    return;
  }

  const promptInput = page.getByTestId('prompt-input');
  if (!SKIP_PROMPT && (await isVisible(promptInput, 5_000))) {
    step = 'send prompt';
    const before = await screenText(page, 'screen-session');
    await promptInput.fill(PROMPT);
    await clickEither(page, 'prompt-send', ['Send']);
    await waitForTranscript(page, before);
  } else {
    log('no prompt input on this session, capturing the transcript as-is');
  }

  step = 'chat shots';
  await page.waitForTimeout(500);
  await scrollScreenFraction(page, 'screen-session', 0);
  await page.waitForTimeout(300);
  await shot(page, '06-chat-top');
  await scrollScreenFraction(page, 'screen-session', 0.5);
  await page.waitForTimeout(300);
  await shot(page, '07-chat-mid');

  await captureDark(page, '06-chat-top-dark', async () => {
    await scrollScreenFraction(page, 'screen-session', 0);
    await page.waitForTimeout(250);
  });
  await captureDark(page, '07-chat-mid-dark', async () => {
    await scrollScreenFraction(page, 'screen-session', 0.5);
    await page.waitForTimeout(250);
  });
}

async function main() {
  const origin = new URL(BASE_URL);
  await fs.mkdir(OUT_DIR, { recursive: true });
  log(`target ${BASE_URL}`);
  log(`output ${OUT_DIR}`);

  const args = process.env.DISABLE_SANDBOX === '1' ? ['--no-sandbox'] : [];
  const browser = await chromium.launch({ headless: true, args });
  let page;

  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'light',
      locale: 'en-US',
    });
    page = await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT);

    step = 'load app';
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

    if (!KEEP_SESSION) {
      await page.evaluate(() => {
        try {
          window.localStorage.clear();
        } catch {
          // A locked-down storage API is not worth failing the run over.
        }
      });
      await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    }

    if (PREAUTH_TOKEN && PREAUTH_HOST) {
      step = 'seed stored credentials';
      await page.evaluate(
        ({ host, port, mode, token }) => {
          window.localStorage.setItem(
            'omp-console.server',
            JSON.stringify({ host, port, mode, deviceName: 'Screenshots' }),
          );
          window.localStorage.setItem('omp-console.device-token', token);
        },
        { host: PREAUTH_HOST, port: PREAUTH_PORT, mode: PREAUTH_MODE, token: PREAUTH_TOKEN },
      );
      await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    }

    step = 'wait for app to hydrate';
    await page
      .getByTestId('screen-welcome')
      .or(page.getByTestId('screen-sessions'))
      .first()
      .waitFor({ state: 'visible', timeout: NAV_TIMEOUT });

    await pair(page, origin);
    await captureChat(page);

    log(`done, ${written.length} screenshots in ${OUT_DIR}`);
  } catch (err) {
    log(`FAILED during "${step}": ${err.message}`);
    if (page) {
      const file = path.join(OUT_DIR, '99-failure.png');
      await page.screenshot({ path: file }).catch(() => {});
      log(`failure screenshot: ${file}`);
    }
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

await main();
