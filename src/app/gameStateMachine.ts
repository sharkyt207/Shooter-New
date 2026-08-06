/**
 * Game state machine.
 *
 * `Boot -> MainMenu -> Base -> Loadout -> Briefing -> Raid -> Result -> Base`
 *
 * Explicit rather than implicit: every transition is declared, and an illegal
 * one is a logged error instead of a half-torn-down screen. States own their
 * cleanup through `exit`, which is what keeps entering a raid twice from
 * leaking a simulation.
 */

import { createLogger } from '@/core/util/logger';

export type GameState = 'boot' | 'menu' | 'base' | 'loadout' | 'briefing' | 'raid' | 'result';

export interface StateHandlers {
  enter?(): void;
  exit?(): void;
  /** Called once per frame while this state is active. */
  update?(dt: number): void;
}

/** Which states may follow which. Anything not listed is rejected. */
const TRANSITIONS: Record<GameState, readonly GameState[]> = {
  boot: ['menu'],
  menu: ['base'],
  base: ['loadout', 'menu'],
  loadout: ['base', 'briefing'],
  briefing: ['loadout', 'raid'],
  raid: ['result'],
  result: ['base'],
};

const log = createLogger('state');

export class GameStateMachine {
  private readonly handlers = new Map<GameState, StateHandlers>();
  private state: GameState = 'boot';

  get current(): GameState {
    return this.state;
  }

  register(state: GameState, handlers: StateHandlers): void {
    this.handlers.set(state, handlers);
  }

  canTransitionTo(next: GameState): boolean {
    return TRANSITIONS[this.state].includes(next);
  }

  /**
   * Switch state.
   * @param force Bypass the transition table. Only for error recovery.
   */
  transitionTo(next: GameState, force = false): boolean {
    if (next === this.state) return true;

    if (!force && !this.canTransitionTo(next)) {
      log.error(`Ungültiger Übergang: ${this.state} -> ${next}`);
      return false;
    }

    this.handlers.get(this.state)?.exit?.();
    log.debug(`${this.state} -> ${next}`);
    this.state = next;
    this.handlers.get(next)?.enter?.();
    return true;
  }

  /**
   * Rebuild the current screen without changing state.
   *
   * Used when something outside the state machine invalidates what is drawn -
   * a language change, for instance. Deliberately not `transitionTo(current)`,
   * which is a no-op by design.
   */
  reenter(): void {
    this.handlers.get(this.state)?.exit?.();
    this.handlers.get(this.state)?.enter?.();
  }

  update(dt: number): void {
    this.handlers.get(this.state)?.update?.(dt);
  }
}
