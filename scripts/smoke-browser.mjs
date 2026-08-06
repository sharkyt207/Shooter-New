#!/usr/bin/env node
/**
 * PROJECT ECHO - browser smoke test.
 *
 * Drives the real game in a real browser through the whole loop:
 *   menu -> base (all tabs) -> loadout -> briefing -> raid -> move, shoot,
 *   light, inventory
 *
 * This is the single most valuable test a game can have. Unit tests prove the
 * simulation is correct; only this proves the thing actually starts, renders
 * and responds - and a black screen on launch is the most expensive bug a
 * mobile game can ship.
 *
 * Usage:
 *   npm run build && npm run preview   # in one terminal
 *   npm run smoke                      # in another
 *
 * Playwright is an optional tool, not a project dependency (ADR-012):
 *   npm install --no-save playwright && npx playwright install chromium
 *
 * Options (environment variables):
 *   URL            target address (default http://localhost:4173/)
 *   CHROMIUM_PATH  explicit Chromium binary, for preinstalled browsers
 *   SHOT_DIR       where to write screenshots (default ./.smoke)
 */

import { mkdirSync } from 'node:fs';

const URL_TARGET = process.env['URL'] ?? 'http://localhost:4173/';
const SHOT_DIR = process.env['SHOT_DIR'] ?? '.smoke';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    '\n  Playwright ist nicht installiert.\n' +
      '  npm install --no-save playwright && npx playwright install chromium\n',
  );
  process.exit(2);
}

mkdirSync(SHOT_DIR, { recursive: true });

const launchOptions = process.env['CHROMIUM_PATH']
  ? { executablePath: process.env['CHROMIUM_PATH'] }
  : {};

const browser = await chromium.launch(launchOptions);
// Landscape phone proportions - the target form factor, not a desktop window.
// The locale is pinned: since M7 the game picks its language from the browser,
// and this script asserts on German strings. Pinning it keeps the assertion
// honest instead of making the language auto-detection untestable.
const page = await browser.newPage({ viewport: { width: 900, height: 480 }, locale: 'de-DE' });

/**
 * A second pass on a real phone shape.
 *
 * 844x390 with a coarse pointer is an iPhone in landscape: the tightest
 * aspect ratio the HUD ever has to survive, and the one nobody looks at
 * because development happens on a desktop.
 */
async function phonePass() {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    locale: 'de-DE',
  });
  const phone = await context.newPage();
  const phoneErrors = [];
  phone.on('console', (msg) => {
    if (msg.type() === 'error') phoneErrors.push(`console.error: ${msg.text()}`);
  });
  phone.on('pageerror', (error) => phoneErrors.push(`pageerror: ${error.message}`));

  const tap = async (text) => {
    const button = phone.locator(`button:has-text("${text}")`).first();
    await button.waitFor({ state: 'visible', timeout: 15000 });
    await button.click({ force: true });
    await phone.waitForTimeout(700);
  };

  await phone.goto(URL_TARGET, { waitUntil: 'networkidle' });
  await phone.waitForTimeout(1200);
  await tap('Riss betreten');   // menu -> base
  await tap('Ausrüstung wählen');
  await tap('Riss betreten');   // loadout -> briefing
  await tap('Riss betreten');   // briefing -> raid
  await phone.waitForTimeout(1800);

  // Drag a thumb, so the virtual stick is drawn at its real size.
  await phone.touchscreen.tap(200, 300);
  await phone.mouse.move(180, 250);
  await phone.mouse.down();
  await phone.mouse.move(240, 300, { steps: 6 });
  await phone.screenshot({ path: `${SHOT_DIR}/12-phone-raid.png` });
  await phone.mouse.up();
  console.log(`  screenshot: ${SHOT_DIR}/12-phone-raid.png`);

  await context.close();
  return phoneErrors;
}

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

async function shot(name) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
  console.log(`  screenshot: ${SHOT_DIR}/${name}.png`);
}

async function clickButton(text) {
  const button = page.locator(`button:has-text("${text}")`).first();
  await button.waitFor({ state: 'visible', timeout: 10000 });
  await button.click();
  await page.waitForTimeout(700);
}

/**
 * The same loop in English.
 *
 * Half a localisation is worse than none - a menu in two languages looks
 * broken. This walks the flow using only English labels, so a missing
 * translation on any screen in the path fails the run rather than being
 * noticed by a player.
 */
async function englishPass() {
  const context = await browser.newContext({ viewport: { width: 900, height: 480 }, locale: 'en-GB' });
  const english = await context.newPage();
  const englishErrors = [];
  english.on('console', (msg) => {
    if (msg.type() === 'error') englishErrors.push(`console.error: ${msg.text()}`);
  });
  english.on('pageerror', (error) => englishErrors.push(`pageerror: ${error.message}`));

  const tap = async (text) => {
    const button = english.locator(`button:has-text("${text}")`).first();
    await button.waitFor({ state: 'visible', timeout: 15000 });
    await button.click({ force: true });
    await english.waitForTimeout(700);
  };

  await english.goto(URL_TARGET, { waitUntil: 'networkidle' });
  await english.waitForTimeout(1200);
  await tap('Enter the rift');     // menu -> base
  await tap('Trade');
  await tap('Workbench');
  await tap('Base');
  await tap('Stash');
  await tap('Choose loadout');
  await tap('Enter the rift');     // loadout -> briefing
  await english.screenshot({ path: `${SHOT_DIR}/13-english-briefing.png` });
  await tap('Enter the rift');     // briefing -> raid
  await english.waitForTimeout(1800);
  await english.screenshot({ path: `${SHOT_DIR}/14-english-raid.png` });
  console.log(`  screenshot: ${SHOT_DIR}/14-english-raid.png`);

  await context.close();
  return englishErrors;
}

try {
  console.log(`\n  Ziel: ${URL_TARGET}\n`);
  await page.goto(URL_TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  console.log('  1/9 Hauptmenü');
  await shot('01-menu');

  // The diagnostics readout, before anything has been recorded. This is the
  // state a privacy-conscious player sees first, and the one no amount of
  // playing would ever reproduce again.
  console.log('  2/9 Diagnose');
  await clickButton('Diagnose');
  await shot('01b-diagnostics');
  await clickButton('Zurück');

  await clickButton('Riss betreten');

  console.log('  3/9 Basis');
  await shot('02-base');

  // Every base tab renders different systems (traders, the craft queue, the
  // build queue). A tab that throws is invisible to unit tests and fatal here.
  for (const [tab, name] of [
    ['Handel', '02b-trader'],
    ['Werkbank', '02c-workbench'],
    ['Basis', '02d-modules'],
  ]) {
    await clickButton(tab);
    await shot(name);
  }
  await clickButton('Lager');

  await clickButton('Ausrüstung wählen');

  console.log('  4/9 Ausrüstung');
  await shot('03-loadout');

  console.log('  5/9 Werkstatt');
  await clickButton('Werkstatt öffnen');
  await shot('04-workshop');
  await clickButton('Zurück');
  await clickButton('Riss betreten');

  console.log('  6/9 Briefing');
  await shot('05-briefing');
  await clickButton('Riss betreten');
  await page.waitForTimeout(1800);

  console.log('  7/9 Raid');
  await shot('06-raid');

  // Exercise simulation and renderer together: move, aim, fire.
  await page.keyboard.down('KeyD');
  await page.mouse.move(700, 240);
  await page.mouse.down();
  await page.waitForTimeout(1600);
  await page.mouse.up();
  await page.keyboard.up('KeyD');
  // Melee and the M2 action buttons share the same input path as firing.
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(400);
  await shot('07-raid-action');

  // The flashlight is the one renderer feature that is invisible unless the
  // raid happens to roll a dark weather, so the smoke test forces it on.
  console.log('  8/9 Licht');
  const lightBtn = page.locator('button[aria-label="Licht"]').first();
  // The HUD redraws constantly under software rendering, and Playwright's
  // stability wait occasionally loses the element mid-click. A forced click
  // with a generous timeout keeps the check meaningful without making the
  // smoke test flaky - a test people learn to ignore protects nothing.
  await lightBtn.click({ force: true, timeout: 15000 });
  await page.waitForTimeout(500);
  await shot('09-light');

  console.log('  9/9 Inventar');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  await shot('08-inventory');

  console.log('  Telefon-Format 844x390');
  errors.push(...(await phonePass()));

  console.log('  Englisch');
  errors.push(...(await englishPass()));

  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let count = 0;
        const start = performance.now();
        const tick = () => {
          count++;
          if (performance.now() - start < 1000) requestAnimationFrame(tick);
          else resolve(count);
        };
        requestAnimationFrame(tick);
      }),
  );

  console.log(`\n  Frames in 1 s: ${frames} (headless, Software-Rendering - kein Gerätewert)`);
  console.log(`  Fehler: ${errors.length}`);
  for (const error of errors.slice(0, 15)) console.log(`    ${error}`);
} finally {
  await browser.close();
}

process.exit(errors.length > 0 ? 1 : 0);
