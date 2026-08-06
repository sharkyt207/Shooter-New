#!/usr/bin/env node
/**
 * PROJECT ECHO - frame cost measurement.
 *
 * Counts real WebGL draw calls and frame time in a real browser, in a real
 * raid. The performance budget in docs/01-ARCHITECTURE.md names 60 draw calls
 * per frame; a number that nobody measures is a number that drifts.
 *
 * The counter wraps `drawElements`/`drawArrays` on the WebGL context *before*
 * the game boots, so it sees everything Pixi does with no cooperation from the
 * renderer.
 *
 * Usage:
 *   npm run build && npm run preview     # in one terminal
 *   node scripts/measure-frame.mjs       # in another
 */

const URL_TARGET = process.env['URL'] ?? 'http://localhost:4173/';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('\n  Playwright fehlt: npm install --no-save playwright\n');
  process.exit(2);
}

const launchOptions = process.env['CHROMIUM_PATH']
  ? { executablePath: process.env['CHROMIUM_PATH'] }
  : {};

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 900, height: 480 } });

// Instrument WebGL before any application code runs.
await page.addInitScript(() => {
  const counter = { draws: 0, frames: 0 };
  window.__echoGl = counter;

  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const original = proto[name];
      if (!original) continue;
      proto[name] = function patched(...args) {
        counter.draws++;
        return original.apply(this, args);
      };
    }
  }

  const tick = () => {
    counter.frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

async function clickButton(text) {
  const button = page.locator(`button:has-text("${text}")`).first();
  await button.waitFor({ state: 'visible', timeout: 15000 });
  await button.click({ force: true });
  await page.waitForTimeout(600);
}

try {
  await page.goto(URL_TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  await clickButton('Riss betreten'); // menu -> base
  await clickButton('Ausrüstung wählen');
  await clickButton('Riss betreten'); // loadout -> briefing
  await clickButton('Riss betreten'); // briefing -> raid
  await page.waitForTimeout(2000);

  // Move and fire, so the sample covers the expensive case rather than a
  // motionless screen.
  await page.keyboard.down('KeyD');
  await page.mouse.move(700, 240);
  await page.mouse.down();

  const sample = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const counter = window.__echoGl;
        const startDraws = counter.draws;
        const startFrames = counter.frames;
        const startTime = performance.now();

        setTimeout(() => {
          const elapsed = performance.now() - startTime;
          const frames = counter.frames - startFrames;
          resolve({
            frames,
            elapsedMs: elapsed,
            draws: counter.draws - startDraws,
            drawsPerFrame: frames > 0 ? (counter.draws - startDraws) / frames : 0,
            msPerFrame: frames > 0 ? elapsed / frames : 0,
          });
        }, 3000);
      }),
  );

  await page.mouse.up();
  await page.keyboard.up('KeyD');

  console.log('\n  Frame-Messung (headless, Software-Rendering)');
  console.log(`    Frames        ${sample.frames} in ${Math.round(sample.elapsedMs)} ms`);
  console.log(`    Draw Calls    ${sample.drawsPerFrame.toFixed(1)} / Frame   (Budget: 60)`);
  console.log(`    Frame-Zeit    ${sample.msPerFrame.toFixed(1)} ms          (Software, kein Gerätewert)\n`);

  process.exitCode = sample.drawsPerFrame > 60 ? 1 : 0;
} finally {
  await browser.close();
}
