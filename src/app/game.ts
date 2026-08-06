/**
 * Composition root.
 *
 * The one place allowed to know every layer (docs/01-ARCHITECTURE.md). It wires
 * the simulation to the renderer, the UI and the platform adapters, and owns
 * the frame loop.
 *
 * Note what is *not* here: no gameplay rules, no drawing, no input decoding.
 * Those live in their own layers; this file only connects them.
 */

import { Application } from 'pixi.js';
import { findItem } from '@/content/items';
import { createLogger } from '@/core/util/logger';
import { FixedClock } from '@/core/time/fixedClock';
import { addItem, countItem } from '@/game/inventory/inventory';
import {
  createDefaultProfile,
  upgradeModule,
  type PlayerProfile,
} from '@/game/base/profile';
import { craft } from '@/game/crafting/crafting';
import {
  buyItem,
  commitLoadout,
  sellItem,
  settleRaid,
  type SettlementReport,
} from '@/game/economy/trader';
import { generateMap, type GeneratedMap } from '@/game/map/mapGenerator';
import { SeededRandom } from '@/core/math/random';
import { RaidSimulation } from '@/game/simulation/raidSimulation';
import { createIntent, type PlayerIntent } from '@/game/player/playerIntent';
import { NullAudio, type AudioService } from '@/platform/audio/audioService';
import { CompositeInput } from '@/platform/input/inputSource';
import { KeyboardMouseInput } from '@/platform/input/keyboardMouseInput';
import { TouchInput } from '@/platform/input/touchInput';
import {
  LocalStorageAdapter,
  SAVE_KEY,
  type StorageAdapter,
} from '@/platform/storage/storageAdapter';
import { createSave, deserialize, serialize } from '@/game/save/saveSystem';
import { AssetRegistry } from '@/render/assets/assetRegistry';
import { PlaceholderFactory } from '@/render/assets/placeholderFactory';
import { WorldRenderer } from '@/render/worldRenderer';
import { Hud } from '@/ui/hud/hud';
import { UiRoot } from '@/ui/uiRoot';
import { createBaseScreen } from '@/ui/screens/baseScreen';
import { createBriefingScreen } from '@/ui/screens/briefingScreen';
import { createInventoryOverlay } from '@/ui/screens/inventoryOverlay';
import { createLoadoutScreen } from '@/ui/screens/loadoutScreen';
import { createMainMenuScreen } from '@/ui/screens/mainMenuScreen';
import { createPauseOverlay } from '@/ui/screens/pauseOverlay';
import { createResultScreen } from '@/ui/screens/resultScreen';
import { GameStateMachine } from './gameStateMachine';
import { buildHudViewModel, type HudViewModel } from '@/ui/viewModel';

const log = createLogger('game');
const VERSION = '0.1.0';

export interface GameOptions {
  canvasContainer: HTMLElement;
  uiContainer: HTMLElement;
  storage?: StorageAdapter;
  audio?: AudioService;
}

export class Game {
  private readonly app = new Application();
  private readonly ui: UiRoot;
  private readonly storage: StorageAdapter;
  private readonly audio: AudioService;
  private readonly states = new GameStateMachine();
  private readonly clock = new FixedClock();

  private touch!: TouchInput;
  private keyboard!: KeyboardMouseInput;
  private input!: CompositeInput;
  private assets!: AssetRegistry;
  private placeholders!: PlaceholderFactory;
  private renderer!: WorldRenderer;

  private profile: PlayerProfile = createDefaultProfile();
  private readonly intent: PlayerIntent = createIntent();

  private sim: RaidSimulation | null = null;
  private hud: Hud | null = null;
  private pendingSeed = 0;
  private pendingMap: GeneratedMap | null = null;
  private lastReport: SettlementReport | null = null;
  private hudViewModel: HudViewModel | null = null;

  private paused = false;
  private inventoryOpen = false;
  private readonly settings = { debug: false, leftHanded: false };

  constructor(private readonly options: GameOptions) {
    this.ui = new UiRoot(options.uiContainer);
    this.storage = options.storage ?? new LocalStorageAdapter();
    this.audio = options.audio ?? new NullAudio();
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.ui.showLoading('Riss wird kalibriert …');

    await this.app.init({
      background: 0x080a0f,
      resizeTo: window,
      antialias: false,
      // Retina sharpness without paying for 3x on high-density phones.
      resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });
    this.options.canvasContainer.appendChild(this.app.canvas);

    this.placeholders = new PlaceholderFactory(this.app.renderer);
    this.assets = new AssetRegistry(this.placeholders);
    await this.assets.load();

    this.renderer = new WorldRenderer(this.assets, this.placeholders);
    this.app.stage.addChild(this.renderer.stage);

    this.touch = new TouchInput(this.app.canvas as unknown as HTMLElement);
    this.keyboard = new KeyboardMouseInput(this.app.canvas as unknown as HTMLElement);
    this.input = new CompositeInput([this.touch, this.keyboard]);
    this.input.attach();

    await this.loadProfile();
    this.registerStates();
    this.installLifecycleHooks();

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());

    this.app.ticker.add((ticker) => this.frame(ticker.deltaMS / 1000));

    this.states.transitionTo('menu');
    log.info(`PROJECT ECHO ${VERSION} gestartet.`);
  }

  // ── Frame loop ───────────────────────────────────────────────────────────

  private frame(dt: number): void {
    const clamped = Math.min(dt, 0.25);
    this.states.update(clamped);
    this.ui.update(clamped);
    this.input.endFrame();
  }

  private updateRaid(dt: number): void {
    const sim = this.sim;
    if (!sim) return;

    const state = this.input.read();

    // Overlays pause the world: a player reading their inventory must not be
    // shot in the meantime.
    const frozen = this.paused || this.inventoryOpen;

    if (state.pause && !frozen) this.openPause();
    if (state.toggleInventory && !frozen) this.openInventory();

    if (!frozen) {
      this.intent.moveX = state.moveX;
      this.intent.moveY = state.moveY;
      this.intent.aimX = state.aimX;
      this.intent.aimY = state.aimY;
      this.intent.fire = state.fire;
      this.intent.sprint = state.sprint;
      this.intent.reload = state.reload;
      this.intent.interact = state.interact;

      sim.applyIntent(this.intent);
      this.clock.advance(dt, () => sim.step());
    }

    // The renderer always runs, so a paused game still shows the world.
    this.renderer.update(frozen ? 1 : this.clock.alpha, dt, state.aimX, state.aimY);
    this.keyboard.setAimAnchor(this.renderer.playerScreenX, this.renderer.playerScreenY);

    this.hudViewModel = buildHudViewModel(sim);
    this.hud?.update(this.hudViewModel, sim.grid);

    if (sim.finished) this.finishRaid();
  }

  // ── States ───────────────────────────────────────────────────────────────

  private registerStates(): void {
    this.states.register('menu', {
      enter: () => {
        this.ui.setScreen(
          createMainMenuScreen(this.profile, VERSION, {
            onContinue: () => this.states.transitionTo('base'),
            onNewProfile: () => {
              this.profile = createDefaultProfile();
              void this.saveProfile();
              this.states.transitionTo('base');
            },
          }),
        );
      },
    });

    this.states.register('base', {
      enter: () => this.showBaseScreen(),
    });

    this.states.register('loadout', {
      enter: () => this.showLoadoutScreen(),
    });

    this.states.register('briefing', {
      enter: () => this.showBriefingScreen(),
    });

    this.states.register('raid', {
      enter: () => this.enterRaid(),
      exit: () => this.exitRaid(),
      update: (dt) => this.updateRaid(dt),
    });

    this.states.register('result', {
      enter: () => {
        const report = this.lastReport;
        if (!report) {
          this.states.transitionTo('base');
          return;
        }
        this.ui.setScreen(
          createResultScreen(report, { onReturnToBase: () => this.states.transitionTo('base') }),
        );
      },
    });
  }

  private showBaseScreen(): void {
    this.ui.setScreen(
      createBaseScreen(this.profile, {
        onStartLoadout: () => this.states.transitionTo('loadout'),

        onUpgrade: (moduleId) => {
          const result = upgradeModule(this.profile, moduleId);
          if (!result.ok) {
            this.ui.toast(
              result.reason === 'notEnoughCredits'
                ? 'Nicht genug Credits.'
                : 'Maximale Stufe erreicht.',
            );
            return;
          }
          this.ui.toast(`Ausgebaut auf Stufe ${result.newLevel}.`);
          void this.saveProfile();
          this.showBaseScreen();
        },

        onSell: (itemId, quantity) => {
          const result = sellItem(this.profile, itemId, quantity);
          if (!result.ok) {
            this.ui.toast('Nicht verfügbar.');
            return;
          }
          this.ui.toast(`+${result.credits} ¢`);
          void this.saveProfile();
          this.showBaseScreen();
        },

        onBuy: (itemId, quantity) => {
          const result = buyItem(this.profile, itemId, quantity);
          if (!result.ok) {
            this.ui.toast(
              result.reason === 'notEnoughCredits' ? 'Nicht genug Credits.' : 'Lager voll.',
            );
            return;
          }
          void this.saveProfile();
          this.showBaseScreen();
        },

        onCraft: (recipeId) => {
          const result = craft(this.profile, recipeId);
          if (!result.ok) {
            this.ui.toast(
              result.reason === 'missingInputs'
                ? 'Material fehlt.'
                : result.reason === 'moduleTooLow'
                  ? 'Werkbank zu niedrig.'
                  : 'Lager voll.',
            );
            return;
          }
          this.ui.toast('Hergestellt.');
          void this.saveProfile();
          this.showBaseScreen();
        },
      }),
    );
  }

  private showLoadoutScreen(): void {
    this.ui.setScreen(
      createLoadoutScreen(this.profile, {
        onBack: () => this.states.transitionTo('base'),

        onEquip: (slot, itemId) => {
          const key =
            slot === 'weapon' ? 'weaponItemId' : slot === 'armor' ? 'armorItemId' : 'backpackItemId';
          this.profile.loadout[key] = itemId;
          void this.saveProfile();
          this.showLoadoutScreen();
        },

        onCarryChange: (itemId, delta) => {
          this.changeCarried(itemId, delta);
          void this.saveProfile();
          this.showLoadoutScreen();
        },

        onConfirm: () => {
          this.pendingSeed = Math.floor(Math.random() * 0xffffffff) >>> 0;
          this.pendingMap = generateMap(new SeededRandom(this.pendingSeed));
          this.states.transitionTo('briefing');
        },
      }),
    );
  }

  private showBriefingScreen(): void {
    const map = this.pendingMap;
    if (!map) {
      this.states.transitionTo('loadout');
      return;
    }

    this.ui.setScreen(
      createBriefingScreen(this.pendingSeed, map, {
        onBack: () => this.states.transitionTo('loadout'),
        onReroll: () => {
          this.pendingSeed = Math.floor(Math.random() * 0xffffffff) >>> 0;
          this.pendingMap = generateMap(new SeededRandom(this.pendingSeed));
          this.showBriefingScreen();
        },
        onEnter: () => {
          // Commit the gear before the raid starts: from this moment it has
          // left the stash and is genuinely at risk (Pillar P1).
          if (!commitLoadout(this.profile)) {
            this.ui.toast('Ausrüstung nicht mehr im Lager verfügbar.');
            this.states.transitionTo('loadout');
            return;
          }
          void this.saveProfile();
          this.states.transitionTo('raid');
        },
      }),
    );
  }

  // ── Raid ─────────────────────────────────────────────────────────────────

  private enterRaid(): void {
    this.paused = false;
    this.inventoryOpen = false;
    this.clock.reset();

    const sim = new RaidSimulation({ seed: this.pendingSeed, loadout: this.profile.loadout });
    this.sim = sim;

    this.renderer.setSimulation(sim);
    this.renderer.setDebug(this.settings.debug);
    this.touch.leftHanded = this.settings.leftHanded;

    this.hud = new Hud(this.touch, {
      onInventory: () => this.openInventory(),
      onPause: () => this.openPause(),
      onUseItem: (itemId) => {
        this.intent.useItemId = itemId;
      },
    });

    this.ui.setScreen(null);
    this.ui.setHud(this.hud.root);
    this.subscribeToRaid(sim);

    sim.start();
    this.audio.setAmbience('raid');
  }

  private subscribeToRaid(sim: RaidSimulation): void {
    sim.bus.on('extraction:opened', (event) => {
      this.hud?.showBanner(`${event.name} offen`);
      this.audio.play('extraction.open');
    });

    sim.bus.on('extraction:closing', (event) => {
      this.hud?.showBanner(`Ausgang schließt in ${Math.round(event.secondsLeft)} s`, 2600);
    });

    sim.bus.on('raid:timeWarning', (event) => {
      this.hud?.showBanner(`Noch ${Math.round(event.secondsLeft / 60)} Minuten`, 2600);
    });

    sim.bus.on('damage:dealt', (event) => {
      if (!event.isPlayerTarget) return;
      this.hud?.flashDamage();
      this.audio.play('player.hurt');
    });

    sim.bus.on('loot:rejected', () => {
      this.ui.toast('Zu schwer. Etwas zurücklassen.');
      this.audio.play('loot.denied');
    });

    sim.bus.on('loot:pickedUp', (event) => {
      const def = findItem(event.itemId);
      if (def) this.ui.toast(`${def.name} ×${event.quantity}`, 1200);
      this.audio.play('loot.pickup');
    });

    sim.bus.on('container:opened', () => this.audio.play('container.open'));
    sim.bus.on('weapon:reloadStarted', () => this.audio.play('weapon.reload'));
    sim.bus.on('weapon:dryFire', () => this.audio.play('weapon.dryfire'));
  }

  private exitRaid(): void {
    this.ui.clearOverlays();
    this.ui.setHud(null);
    this.hud?.destroy();
    this.hud = null;

    this.renderer.teardown();
    this.sim?.dispose();
    this.sim = null;
    this.hudViewModel = null;
    this.audio.setAmbience(null);
  }

  private finishRaid(): void {
    const outcome = this.sim?.outcome;
    if (!outcome) return;

    this.lastReport = settleRaid(this.profile, outcome);
    this.ensurePlayable();
    this.repairLoadout();
    void this.saveProfile();
    this.audio.play(outcome.kind === 'extracted' ? 'extraction.success' : 'player.die');
    this.states.transitionTo('result');
  }

  // ── Overlays ─────────────────────────────────────────────────────────────

  private openInventory(): void {
    if (this.inventoryOpen || !this.sim) return;
    this.inventoryOpen = true;

    this.ui.pushOverlay(
      createInventoryOverlay(
        () => this.hudViewModel ?? buildHudViewModel(this.sim as RaidSimulation),
        {
          onClose: () => this.closeOverlays(),
          onUse: (itemId) => {
            this.intent.useItemId = itemId;
          },
          onDrop: (itemId, quantity) => {
            this.intent.dropItemId = itemId;
            this.intent.dropQuantity = quantity;
          },
        },
      ),
    );
  }

  private openPause(): void {
    if (this.paused) return;
    this.paused = true;

    this.ui.pushOverlay(
      createPauseOverlay(this.settings, {
        onResume: () => this.closeOverlays(),
        onAbandon: () => {
          this.closeOverlays();
          // Abandoning costs exactly what dying costs - no free exit.
          this.lastReport = settleRaid(this.profile, {
            kind: 'died',
            durationSeconds: this.sim?.elapsedSeconds ?? 0,
            kills: 0,
            xp: 0,
            lootValue: 0,
            loot: [],
            retainedShards: 0,
            zoneName: null,
          });
          void this.saveProfile();
          this.states.transitionTo('result');
        },
        onToggleDebug: () => this.renderer.setDebug(this.settings.debug),
        onToggleHanded: () => {
          this.touch.leftHanded = this.settings.leftHanded;
        },
      }),
    );
  }

  private closeOverlays(): void {
    this.ui.clearOverlays();
    this.paused = false;
    this.inventoryOpen = false;
  }

  // ── Loadout helpers ──────────────────────────────────────────────────────

  /**
   * Move items between the stash and the packed loadout.
   * The stash stays the single source of truth; `carried` is a reservation.
   */
  private changeCarried(itemId: string, delta: number): void {
    const carried = this.profile.loadout.carried;
    const existing = carried.find((slot) => slot.itemId === itemId);
    const packed = existing?.quantity ?? 0;

    if (delta > 0) {
      const available = countItem(this.profile.stash, itemId) - packed;
      const amount = Math.min(delta, Math.max(0, available));
      if (amount <= 0) {
        this.ui.toast('Nicht genug im Lager.');
        return;
      }
      if (existing) existing.quantity += amount;
      else carried.push({ itemId, quantity: amount });
      return;
    }

    const amount = Math.min(-delta, packed);
    if (amount <= 0 || !existing) return;
    existing.quantity -= amount;
    if (existing.quantity <= 0) {
      carried.splice(carried.indexOf(existing), 1);
    }
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private async loadProfile(): Promise<void> {
    const raw = await this.storage.get(SAVE_KEY);
    const result = deserialize(raw, Date.now());
    this.profile = result.save.profile;

    if (result.notes.length > 0) {
      for (const note of result.notes) log.warn(note);
      this.ui.toast(result.notes[0] as string, 4000);
    }

    // A loadout can reference gear that is no longer in the stash (e.g. after a
    // death). Repair it here so the loadout screen always opens in a valid state.
    this.repairLoadout();
  }

  private repairLoadout(): void {
    const { loadout, stash } = this.profile;

    for (const key of ['weaponItemId', 'armorItemId', 'backpackItemId'] as const) {
      const itemId = loadout[key];
      if (itemId && countItem(stash, itemId) <= 0) loadout[key] = null;
    }

    loadout.carried = loadout.carried
      .map((slot) => ({
        itemId: slot.itemId,
        quantity: Math.min(slot.quantity, countItem(stash, slot.itemId)),
      }))
      .filter((slot) => slot.quantity > 0);

    // Fall back to any weapon still in the stash, so the player is never stuck
    // on a loadout screen with nothing selectable.
    if (!loadout.weaponItemId) {
      const weapon = stash.slots.find((slot) => findItem(slot.itemId)?.category === 'weapon');
      if (weapon) loadout.weaponItemId = weapon.itemId;
    }
    if (!loadout.backpackItemId) {
      const bag = stash.slots.find((slot) => findItem(slot.itemId)?.category === 'backpack');
      if (bag) loadout.backpackItemId = bag.itemId;
    }
  }

  private async saveProfile(): Promise<void> {
    await this.storage.set(SAVE_KEY, serialize(createSave(this.profile, Date.now())));
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  private installLifecycleHooks(): void {
    // A phone can kill a backgrounded app without warning, so save on the way
    // out and pause the raid rather than letting it run unattended.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      void this.saveProfile();
      this.audio.suspend();
      if (this.states.current === 'raid') this.openPause();
    });

    window.addEventListener('pagehide', () => void this.saveProfile());
  }

  private handleResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.resize(width, height);
  }

  /**
   * Guarantee the player can always start another raid.
   *
   * Losing everything is the point of the genre; being unable to play
   * afterwards is not. If the stash holds no weapon, the base issues a basic
   * kit free of charge.
   */
  private ensurePlayable(): void {
    const hasWeapon = this.profile.stash.slots.some(
      (slot) => findItem(slot.itemId)?.category === 'weapon',
    );
    if (hasWeapon) return;

    addItem(this.profile.stash, 'itm_wpn_splitter', 1);
    addItem(this.profile.stash, 'itm_ammo_9mm', 60);
    addItem(this.profile.stash, 'itm_bandage', 2);
    if (!this.profile.stash.slots.some((slot) => findItem(slot.itemId)?.category === 'backpack')) {
      addItem(this.profile.stash, 'itm_bag_small', 1);
    }
    this.ui.toast('Notausrüstung aus Basisbestand ausgegeben.', 3600);
  }
}
