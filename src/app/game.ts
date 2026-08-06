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
import { createDefaultProfile, type PlayerProfile } from '@/game/base/profile';
import {
  collectBuilds,
  startUpgrade,
  type BuildFailure,
} from '@/game/base/buildQueue';
import { advanceQuest } from '@/game/base/questLine';
import {
  collectCrafts,
  startCraft,
  type CraftFailure,
} from '@/game/crafting/craftQueue';
import { completeContract, refreshContracts } from '@/game/economy/contracts';
import { collectInsurance } from '@/game/economy/insurance';
import { fitAttachment, repairWeapon } from '@/game/base/workshop';
import type { AttachmentSlot } from '@/content/types';
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
import { secureCapacityKg } from '@/game/player/loadout';
import { applyDisplayPreferences, bindLifecycle } from '@/platform/native/appLifecycle';
import { createHaptics, NullHaptics, type HapticsService } from '@/platform/native/haptics';
import { isTouchDevice } from '@/platform/native/nativeBridge';
import { NullAudio, type AudioService } from '@/platform/audio/audioService';
import { CompositeInput } from '@/platform/input/inputSource';
import { KeyboardMouseInput } from '@/platform/input/keyboardMouseInput';
import { TouchInput } from '@/platform/input/touchInput';
import {
  createStorage,
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
import { createWorkshopScreen } from '@/ui/screens/workshopScreen';
import { GameStateMachine } from './gameStateMachine';
import { buildHudViewModel, type HudViewModel } from '@/ui/viewModel';

/** Why a build could not start, in the player's language. */
const BUILD_MESSAGES: Record<BuildFailure, string> = {
  unknownModule: 'Unbekanntes Modul.',
  maxLevel: 'Maximale Stufe erreicht.',
  notEnoughCredits: 'Nicht genug Credits.',
  requirementsNotMet: 'Voraussetzungen fehlen.',
  alreadyBuilding: 'Wird bereits gebaut.',
};

const CRAFT_MESSAGES: Record<CraftFailure, string> = {
  unknownRecipe: 'Unbekanntes Rezept.',
  moduleTooLow: 'Werkbank zu niedrig.',
  missingInputs: 'Material fehlt.',
  noSpace: 'Lager voll.',
  queueFull: 'Werkbank ausgelastet.',
};

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
  private storage: StorageAdapter;
  private haptics: HapticsService = new NullHaptics();
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
    // A synchronous fallback so the field is never undefined; `start()` swaps in
    // the best adapter this build can actually reach.
    this.storage = options.storage ?? new LocalStorageAdapter();
    this.audio = options.audio ?? new NullAudio();
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.ui.showLoading('Riss wird kalibriert …');

    // Native capabilities first: the save has to be read from the right place,
    // and a landscape lock applied before the first layout pass.
    if (!this.options.storage) this.storage = await createStorage();
    this.haptics = await createHaptics();
    await applyDisplayPreferences();

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
    // iOS fires `orientationchange` before the viewport metrics settle, so the
    // layout is recomputed once more on the next frame.
    window.addEventListener('orientationchange', () => {
      requestAnimationFrame(() => this.handleResize());
    });

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
      if (state.melee) this.intent.melee = true;

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
    this.collectMeta();

    this.ui.setScreen(
      createBaseScreen(this.profile, {
        now: () => Date.now(),
        onStartLoadout: () => this.states.transitionTo('loadout'),

        onUpgrade: (moduleId) => {
          const result = startUpgrade(this.profile, moduleId, Date.now());
          if (!result.ok) {
            this.ui.toast(BUILD_MESSAGES[result.reason ?? 'unknownModule']);
            return;
          }
          this.ui.toast(result.instant ? 'Ausgebaut.' : 'Bau begonnen.');
          void this.saveProfile();
          this.showBaseScreen();
        },

        onSell: (itemId, quantity, traderId) => {
          const result = sellItem(this.profile, itemId, quantity, traderId);
          if (!result.ok) {
            this.ui.toast(result.reason === 'refused' ? 'Das kauft er nicht.' : 'Nicht verfügbar.');
            return;
          }
          this.ui.toast(`+${result.credits} ¢`);
          if (result.newTier) this.ui.toast(`Ruf gestiegen: Stufe ${result.newTier}`, 2200);
          void this.saveProfile();
          this.showBaseScreen();
        },

        onBuy: (itemId, quantity, traderId) => {
          const result = buyItem(this.profile, itemId, quantity, traderId);
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
          const result = startCraft(this.profile, recipeId, Date.now());
          if (!result.ok) {
            this.ui.toast(CRAFT_MESSAGES[result.reason ?? 'unknownRecipe']);
            return;
          }
          this.ui.toast('In Arbeit.');
          void this.saveProfile();
          this.showBaseScreen();
        },

        onCompleteContract: (templateId) => {
          const result = completeContract(this.profile, templateId);
          if (!result.ok) {
            this.ui.toast('Material fehlt.');
            return;
          }
          this.ui.toast(`Auftrag erfüllt · +${result.credits} ¢`, 2200);
          if (result.newTier) this.ui.toast(`Ruf gestiegen: Stufe ${result.newTier}`, 2200);
          void this.saveProfile();
          this.showBaseScreen();
        },
      }),
    );
  }

  /**
   * Bring the base up to date with the wall clock.
   *
   * Builds, crafts and insurance all run in real time and keep running during a
   * raid - so this is called whenever the player arrives at the base, and it is
   * the only place those queues are drained.
   */
  private collectMeta(): void {
    const now = Date.now();
    let changed = false;

    for (const build of collectBuilds(this.profile, now)) {
      this.ui.toast(`${build.moduleName} Stufe ${build.level} fertig.`, 2600);
      changed = true;
    }

    for (const craft of collectCrafts(this.profile, now)) {
      this.ui.toast(
        craft.failed
          ? `${craft.recipeName}: fehlgeschlagen, Material teilweise zurück.`
          : `${craft.recipeName} fertiggestellt.`,
        2600,
      );
      if (!craft.failed) {
        for (const completion of advanceQuest(this.profile, { crafted: 1 }, now)) {
          this.ui.toast(`Auftrag abgeschlossen: ${completion.stage.name}`, 3000);
        }
      }
      changed = true;
    }

    for (const entry of collectInsurance(this.profile, now)) {
      const def = findItem(entry.itemId);
      this.ui.toast(`Versicherung: ${def?.name ?? entry.itemId} ×${entry.quantity}`, 2600);
      changed = true;
    }

    // The base level can satisfy a quest stage on its own, so nudge the line
    // whenever the base changed.
    if (changed) {
      for (const completion of advanceQuest(this.profile, {}, now)) {
        this.ui.toast(`Auftrag abgeschlossen: ${completion.stage.name}`, 3000);
      }
    }

    if (refreshContracts(this.profile, now)) changed = true;
    if (changed) void this.saveProfile();
  }

  private showLoadoutScreen(): void {
    this.ui.setScreen(
      createLoadoutScreen(this.profile, {
        onBack: () => this.states.transitionTo('base'),

        onEquip: (slot, itemId) => {
          const key =
            slot === 'weapon'
              ? 'weaponItemId'
              : slot === 'armor'
                ? 'armorItemId'
                : slot === 'helmet'
                  ? 'helmetItemId'
                  : 'backpackItemId';

          // Changing the weapon invalidates its fittings and its condition -
          // the attachments belong to the gun that left, not to the new one.
          if (key === 'weaponItemId' && itemId !== this.profile.loadout.weaponItemId) {
            this.returnAttachmentsToStash();
            this.profile.loadout.preferredAmmoItemId = null;
            this.profile.loadout.weaponCondition = 1;
            this.profile.weaponRepairs = 0;
          }

          this.profile.loadout[key] = itemId;
          void this.saveProfile();
          this.showLoadoutScreen();
        },

        onEquipSecure: (itemId) => {
          // Swapping containers empties the old one back into the stash rather
          // than silently dropping what was inside it.
          if (itemId !== this.profile.loadout.secureContainerItemId) {
            this.profile.loadout.secureItems = [];
          }
          this.profile.loadout.secureContainerItemId = itemId;
          void this.saveProfile();
          this.showLoadoutScreen();
        },

        onSecureChange: (itemId, delta) => {
          this.changeSecure(itemId, delta);
          void this.saveProfile();
          this.showLoadoutScreen();
        },

        onToggleInsurance: () => {
          this.profile.loadout.insured = !this.profile.loadout.insured;
          void this.saveProfile();
          this.showLoadoutScreen();
        },

        onSelectAmmo: (itemId) => {
          this.profile.loadout.preferredAmmoItemId = itemId;
          void this.saveProfile();
          this.showLoadoutScreen();
        },

        onOpenWorkshop: () => this.showWorkshopScreen(),

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

  private showWorkshopScreen(): void {
    this.ui.setScreen(
      createWorkshopScreen(this.profile, {
        onBack: () => this.showLoadoutScreen(),

        onFit: (slot, attachmentId) => {
          const result = fitAttachment(this.profile, slot, attachmentId);
          if (!result.ok) {
            this.ui.toast(
              result.reason === 'notInStash'
                ? 'Teil nicht im Lager.'
                : result.reason === 'moduleTooLow'
                  ? 'Werkbank zu niedrig.'
                  : 'Passt nicht.',
            );
            return;
          }
          void this.saveProfile();
          this.showWorkshopScreen();
        },

        onRepair: () => {
          const result = repairWeapon(this.profile);
          if (!result.ok) {
            this.ui.toast(
              result.reason === 'notEnoughCredits'
                ? 'Nicht genug Credits.'
                : result.reason === 'moduleTooLow'
                  ? 'Werkbank Stufe 2 nötig.'
                  : 'Nichts instandzusetzen.',
            );
            return;
          }
          this.ui.toast(`Instandgesetzt für ${result.cost} ¢.`);
          void this.saveProfile();
          this.showWorkshopScreen();
        },
      }),
    );
  }

  /** Pull every fitted attachment back into the stash. */
  private returnAttachmentsToStash(): void {
    for (const slot of Object.keys(this.profile.loadout.attachments) as AttachmentSlot[]) {
      fitAttachment(this.profile, slot, null);
    }
    this.profile.loadout.attachments = {};
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
      onThrowItem: (itemId) => {
        this.intent.throwItemId = itemId;
      },
      onMelee: () => {
        this.intent.melee = true;
      },
      onToggleLight: () => {
        this.intent.toggleLight = true;
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
      this.haptics.impact('light');
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
      // Haptics are reserved for what happens *to* the player. A buzz on every
      // shot is noise; a buzz on being hit is information (M6).
      this.haptics.impact(event.amount > 25 ? 'heavy' : 'medium');
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
    sim.bus.on('weapon:jammed', () => {
      this.audio.play('weapon.dryfire');
      this.haptics.warn();
    });

    sim.bus.on('anomaly:entered', () => this.audio.play('anomaly.enter'));
    sim.bus.on('anomaly:exited', () => this.audio.play('anomaly.exit'));
    sim.bus.on('anomaly:pulsed', (event) => {
      this.audio.play('anomaly.pulse', { x: event.x, y: event.y });
      this.haptics.impact('heavy');
    });
    sim.bus.on('anomaly:echo', (event) => {
      this.audio.play('anomaly.echo', { x: event.x, y: event.y });
    });

    sim.bus.on('door:opened', (event) => {
      this.audio.play('door.open', { x: event.x, y: event.y });
      if (event.wasLocked) {
        this.ui.toast('Schloss entriegelt.', 1400);
        this.haptics.impact('medium');
      }
    });

    // Only tell the player about a lock once per raid per door - a message that
    // repeats every tick while standing in a doorway is noise, not information.
    const reportedLocks = new Set<number>();
    sim.bus.on('door:locked', (event) => {
      if (reportedLocks.has(event.entity)) return;
      reportedLocks.add(event.entity);
      const key = event.keyItemId ? findItem(event.keyItemId)?.name : null;
      this.ui.toast(key ? `Verschlossen. Benötigt: ${key}` : 'Verschlossen.', 2200);
      this.audio.play('door.locked');
    });
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

    this.lastReport = settleRaid(this.profile, outcome, Date.now());
    this.reportSettlement(this.lastReport);
    this.ensurePlayable();
    this.repairLoadout();
    void this.saveProfile();
    this.audio.play(outcome.kind === 'extracted' ? 'extraction.success' : 'player.die');
    this.states.transitionTo('result');
  }

  /**
   * Move an item between the stash and the secure container.
   *
   * The stash is the source of truth until the raid starts: what sits in the
   * container list is a *reservation*, and `commitLoadout` is what actually
   * takes it. So this only has to respect the container's weight limit.
   */
  private changeSecure(itemId: string, delta: number): void {
    const { loadout } = this.profile;
    const slots = loadout.secureItems;
    const existing = slots.find((slot) => slot.itemId === itemId);

    if (delta < 0) {
      if (!existing) return;
      existing.quantity += delta;
      if (existing.quantity <= 0) {
        loadout.secureItems = slots.filter((slot) => slot !== existing);
      }
      return;
    }

    const reserved = slots.reduce((sum, slot) => sum + slot.quantity, 0);
    void reserved;
    const inStash = countItem(this.profile.stash, itemId);
    const alreadyTaken = existing?.quantity ?? 0;
    if (alreadyTaken + delta > inStash) return;

    const weight = findItem(itemId)?.weight ?? 0;
    const used = slots.reduce(
      (sum, slot) => sum + (findItem(slot.itemId)?.weight ?? 0) * slot.quantity,
      0,
    );
    if (used + weight * delta > secureCapacityKg(loadout)) return;

    if (existing) existing.quantity += delta;
    else slots.push({ itemId, quantity: delta });
  }

  /** Surface what the settlement did beyond moving loot. */
  private reportSettlement(report: SettlementReport): void {
    for (const completion of report.questCompletions) {
      this.ui.toast(`Auftrag abgeschlossen: ${completion.stage.name}`, 3200);
    }
    if (report.insuranceReturns.length > 0) {
      this.ui.toast(
        `Versicherung: ${report.insuranceReturns.length} Teile in ${report.insuranceMinutes} min zurück.`,
        3200,
      );
    }
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
          onSecure: (itemId) => {
            this.intent.secureItemId = itemId;
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
          // Abandoning costs exactly what dying costs - no free exit. The
          // secure container is the one exception, as it is everywhere else.
          const sim = this.sim;
          const player = sim?.world.playerEntity ?? null;
          const secure =
            player !== null ? (sim?.world.carriers.get(player)?.secure ?? null) : null;

          this.lastReport = settleRaid(
            this.profile,
            {
              kind: 'died',
              durationSeconds: sim?.elapsedSeconds ?? 0,
              kills: 0,
              xp: 0,
              lootValue: 0,
              loot: [],
              securedLoot: secure
                ? secure.slots.map((slot) => ({ itemId: slot.itemId, quantity: slot.quantity }))
                : [],
              securedValue: 0,
              vaultsOpened: 0,
              anomaliesSurvived: 0,
              retainedShards: 0,
              zoneName: null,
              weaponCondition: this.profile.loadout.weaponCondition,
            },
            Date.now(),
          );
          this.reportSettlement(this.lastReport);
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

  /**
   * Survive an interruption without losing anything.
   *
   * A phone can freeze or kill a backgrounded app without warning. Both the web
   * and the native lifecycle are wired to the same handler, and everything it
   * does is idempotent - the two sources overlap on purpose, because missing
   * the save is far worse than doing it twice.
   */
  private installLifecycleHooks(): void {
    bindLifecycle({
      onSuspend: () => {
        void this.saveProfile();
        this.audio.suspend();
        // A raid must never run on unattended - the player would come back dead.
        if (this.states.current === 'raid') this.openPause();
      },
      onResume: () => {
        this.audio.resume();
      },
    });
  }

  private handleResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.resize(width, height);
    // The thumb sticks are sized from the viewport, not from a fixed pixel
    // count - see docs/modules/platform-mobile.md.
    this.touch.resize(width, height);

    // Portrait is playable but wastes most of the screen, so the game asks for
    // landscape rather than refusing to run. On a device where the orientation
    // lock succeeded this never appears.
    this.ui.setOrientationNotice(height > width * 1.05 && isTouchDevice());
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
