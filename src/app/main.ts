/**
 * Entry point.
 *
 * Keeps startup deliberately boring: find the mount points, start the game,
 * and make sure any failure produces a readable message rather than a black
 * screen. A blank screen on launch is the most expensive bug a mobile game can
 * ship.
 */

import '@/ui/styles/main.css';
import { LogLevel, setLogLevel } from '@/core/util/logger';
import { registerServiceWorker } from '@/platform/pwa/serviceWorker';
import { Game } from './game';

setLogLevel(import.meta.env.DEV ? LogLevel.Debug : LogLevel.Warn);

async function bootstrap(): Promise<void> {
  const canvasContainer = document.getElementById('game-canvas');
  const uiContainer = document.getElementById('ui-root');

  if (!canvasContainer || !uiContainer) {
    throw new Error('Mount-Punkte fehlen in index.html');
  }

  const game = new Game({ canvasContainer, uiContainer });
  await game.start();

  // After the game is up, never before: an offline cache is a convenience, and
  // a convenience must not be able to delay or break the first frame.
  void registerServiceWorker();
}

bootstrap().catch((error: unknown) => {
  console.error('[boot] Start fehlgeschlagen', error);
  showFatalError(error);
});

/** Last-resort error screen, built without touching any game module. */
function showFatalError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const container = document.getElementById('ui-root') ?? document.body;

  container.innerHTML = `
    <div class="loading" style="gap:1rem;text-align:center;padding:2rem">
      <div class="title" style="color:#ff4d5e">Startfehler</div>
      <div style="color:#9aa5b5;max-width:36ch;font-family:var(--font-body);text-transform:none;letter-spacing:0">
        Das Spiel konnte nicht gestartet werden.
      </div>
      <code style="color:#6b7787;font-size:0.75rem;max-width:40ch;word-break:break-word">${escapeHtml(message)}</code>
    </div>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
