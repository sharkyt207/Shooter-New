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
import { findWeapon } from '@/content/weapons';
import { createLogger } from '@/core/util/logger';
import { applyBalanceOverlay, balanceVersion } from '@/content/balanceOverlay';
import { createRemoteConfig } from '@/platform/config/remoteConfig';
import {
  createRaidRecorder,
  emptyTelemetry,
  parseTelemetry,
  recordRaid,
  summarise,
  type RaidRecorder,
  type TelemetryState,
} from '@/game/telemetry/telemetry';
import { FixedClock } from '@/core/time/fixedClock';
import { addItem, countItem } from '@/game/inventory/inventory';
import { createDefaultProfile, type PlayerProfile } from '@/game/base/profile';
import {
  collectBuilds,
  startUpgrade,
  type BuildFailure,
} from '@/game/base/buildQueue';
import { advanceQuest } from '@/game/base/questLine';
import { takeHint } from '@/game/base/onboarding';
import type { HintDef, HintTrigger } from '@/content/hints';
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
import type { AudioService } from '@/platform/audio/audioService';
import { createAudio } from '@/platform/audio/webAudio';
import { setUiFeedback } from '@/ui/components/dom';
import {
  registerCatalogue,
  setLocale,
  t,
  tf,
  type Locale,
} from '@/core/i18n/i18n';
import { EN } from '@/content/locales/en';
import { loadUiAssets } from '@/ui/assets/uiAssets';
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
import { createDiagnosticsScreen } from '@/ui/screens/diagnosticsScreen';
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

/** Storage key for the chosen language. Deliberately outside the profile. */
const LOCALE_KEY = 'locale';
/**
 * Telemetry lives outside the profile.
 *
 * It describes how the *game* behaves, not how a character is doing. Wiping a
 * profile to start over is exactly the moment the balancing history becomes
 * most interesting, so it must survive that.
 */
const TELEMETRY_KEY = 'telemetry';

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
  /** Onboarding hints waiting for the banner to free up. */
  private telemetry: TelemetryState = emptyTelemetry();
  private recorder: RaidRecorder | null = null;

  private readonly hintQueue: HintDef[] = [];
  private hintUntil = 0;
  private readonly settings: { debug: boolean; leftHanded: boolean; locale: Locale } = {
    debug: false,
    leftHanded: false,
    locale: 'de',
  };

  constructor(private readonly options: GameOptions) {
    this.ui = new UiRoot(options.uiContainer);
    // A synchronous fallback so the field is never undefined; `start()` swaps in
    // the best adapter this build can actually reach.
    this.storage = options.storage ?? new LocalStorageAdapter();
    // Real audio since M7. `NullAudio` stays as the injectable stub for tests
    // and for any environment that forbids an AudioContext.
    this.audio = options.audio ?? createAudio();
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.ui.showLoading(t('Riss wird kalibriert …'));

    // Language before anything draws, or the first screen renders in German and
    // then flickers.
    registerCatalogue('en', EN);
    this.settings.locale = await this.loadLocale();
    setLocale(this.settings.locale);

    // Native capabilities first: the save has to be read from the right place,
    // and a landscape lock applied before the first layout pass.
    if (!this.options.storage) this.storage = await createStorage();
    this.haptics = await createHaptics();
    await applyDisplayPreferences();

    // Balance numbers before the first simulation exists. A patch that arrived
    // mid-session would make a raid unreproducible from its seed (ADR-018).
    await this.applyRemoteBalance();

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
    // Both layers read the same manifest: the renderer for textures, the DOM
    // overlay for URLs. One place for paths, two consumers (ADR-008).
    await Promise.all([this.assets.load(), loadUiAssets()]);

    this.renderer = new WorldRenderer(this.assets, this.placeholders);
    this.app.stage.addChild(this.renderer.stage);

    this.touch = new TouchInput(this.app.canvas as unknown as HTMLElement);
    this.keyboard = new KeyboardMouseInput(this.app.canvas as unknown as HTMLElement);
    this.input = new CompositeInput([this.touch, this.keyboard]);
    this.input.attach();

    await this.loadProfile();
    await this.loadTelemetry();
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

    // Give every button its tap sound without touching sixty call sites.
    setUiFeedback((id) => this.audio.play(id));

    this.states.transitionTo('menu');
    this.audio.setAmbience('menu');
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

    this.drainHints();

    this.hudViewModel = buildHudViewModel(sim);
    this.hud?.update(this.hudViewModel, sim.grid);
    // Where the player is, is where the ear is.
    this.audio.setListener(this.hudViewModel.playerX, this.hudViewModel.playerY);

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
            onDiagnostics: () => this.states.transitionTo('diagnostics'),
          }),
        );
      },
    });

    this.states.register('diagnostics', {
      enter: () => {
        this.ui.setScreen(
          createDiagnosticsScreen(summarise(this.telemetry), balanceVersion(), {
            onBack: () => this.states.transitionTo('menu'),
            onClear: () => {
              this.telemetry = emptyTelemetry();
              void this.saveTelemetry();
              this.states.reenter();
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
            this.ui.toast(t(BUILD_MESSAGES[result.reason ?? 'unknownModule']));
            return;
          }
          this.ui.toast(result.instant ? t('Ausgebaut.') : t('Bau begonnen.'));
          void this.saveProfile();
          this.showBaseScreen();
        },

        onSell: (itemId, quantity, traderId) => {
          const result = sellItem(this.profile, itemId, quantity, traderId);
          if (!result.ok) {
            this.ui.toast(
              result.reason === 'refused' ? t('Das kauft er nicht.') : t('Nicht verfügbar.'),
            );
            return;
          }
          this.ui.toast(`+${result.credits} ¢`);
          if (result.newTier) this.ui.toast(tf('Ruf gestiegen: Stufe {tier}', { tier: result.newTier }), 2200);
          void this.saveProfile();
          this.showBaseScreen();
        },

        onBuy: (itemId, quantity, traderId) => {
          const result = buyItem(this.profile, itemId, quantity, traderId);
          if (!result.ok) {
            this.ui.toast(
              result.reason === 'notEnoughCredits' ? t('Nicht genug Credits.') : t('Lager voll.'),
            );
            return;
          }
          void this.saveProfile();
          this.showBaseScreen();
        },

        onCraft: (recipeId) => {
          const result = startCraft(this.profile, recipeId, Date.now());
          if (!result.ok) {
            this.ui.toast(t(CRAFT_MESSAGES[result.reason ?? 'unknownRecipe']));
            return;
          }
          this.ui.toast(t('In Arbeit.'));
          void this.saveProfile();
          this.showBaseScreen();
        },

        onCompleteContract: (templateId) => {
          const result = completeContract(this.profile, templateId);
          if (!result.ok) {
            this.ui.toast(t('Material fehlt.'));
            return;
          }
          this.ui.toast(tf('Auftrag erfüllt · +{credits} ¢', { credits: result.credits ?? 0 }), 2200);
          if (result.newTier) this.ui.toast(tf('Ruf gestiegen: Stufe {tier}', { tier: result.newTier }), 2200);
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
      this.ui.toast(
        tf('{module} Stufe {level} fertig.', {
          module: t(build.moduleName),
          level: build.level,
        }),
        2600,
      );
      changed = true;
    }

    for (const craft of collectCrafts(this.profile, now)) {
      this.ui.toast(
        craft.failed
          ? tf('{recipe}: fehlgeschlagen, Material teilweise zurück.', {
              recipe: t(craft.recipeName),
            })
          : tf('{recipe} fertiggestellt.', { recipe: t(craft.recipeName) }),
        2600,
      );
      if (!craft.failed) {
        for (const completion of advanceQuest(this.profile, { crafted: 1 }, now)) {
          this.ui.toast(tf('Auftrag abgeschlossen: {stage}', { stage: t(completion.stage.name) }), 3000);
        }
      }
      changed = true;
    }

    for (const entry of collectInsurance(this.profile, now)) {
      const def = findItem(entry.itemId);
      this.ui.toast(
        tf('Versicherung: {item} ×{count}', {
          item: t(def?.name ?? entry.itemId),
          count: entry.quantity,
        }),
        2600,
      );
      changed = true;
    }

    // The base level can satisfy a quest stage on its own, so nudge the line
    // whenever the base changed.
    if (changed) {
      for (const completion of advanceQuest(this.profile, {}, now)) {
        this.ui.toast(tf('Auftrag abgeschlossen: {stage}', { stage: t(completion.stage.name) }), 3000);
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
                ? t('Teil nicht im Lager.')
                : result.reason === 'moduleTooLow'
                  ? t('Werkbank zu niedrig.')
                  : t('Passt nicht.'),
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
                ? t('Nicht genug Credits.')
                : result.reason === 'moduleTooLow'
                  ? t('Werkbank Stufe 2 nötig.')
                  : t('Nichts instandzusetzen.'),
            );
            return;
          }
          this.ui.toast(tf('Instandgesetzt für {cost} ¢.', { cost: result.cost ?? 0 }));
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
            this.ui.toast(t('Ausrüstung nicht mehr im Lager verfügbar.'));
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
    this.hintQueue.length = 0;
    this.hintUntil = 0;

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
    // After start(), because the player entity does not exist before it.
    const player = sim.world.playerEntity;
    if (player !== null) {
      this.recorder = createRaidRecorder(sim.bus, this.pendingSeed, balanceVersion(), player);
    }
    this.audio.setAmbience('raid');
  }

  private subscribeToRaid(sim: RaidSimulation): void {
    // Gunfire is the loudest thing in the game and the one the player uses to
    // judge distance, so it is positional and keyed by weapon class.
    sim.bus.on('weapon:fired', (event) => {
      const weapon = findWeapon(event.weaponId);
      const id =
        weapon?.weaponClass === 'shotgun'
          ? 'weapon.fire.shotgun'
          : weapon?.weaponClass === 'marksman'
            ? 'weapon.fire.marksman'
            : 'weapon.fire.smg';
      this.audio.play(id, {
        x: event.x,
        y: event.y,
        // A little pitch variation, or a held trigger turns into a machine.
        rate: 0.94 + ((event.entity * 37) % 13) * 0.01,
      });
    });

    sim.bus.on('projectile:impact', (event) => {
      this.audio.play(event.surface === 'actor' ? 'impact.flesh' : 'impact.wall', {
        x: event.x,
        y: event.y,
      });
    });

    sim.bus.on('entity:died', (event) => {
      this.audio.play('enemy.die', { x: event.x, y: event.y });
    });

    // The single sound a player must never miss.
    sim.bus.on('ai:alerted', (event) => {
      this.audio.play('enemy.alert', { x: event.x, y: event.y });
    });

    sim.bus.on('melee:swing', (event) => {
      this.audio.play('weapon.dryfire', { x: event.x, y: event.y, volume: 0.6 });
    });

    sim.bus.on('extraction:progress', () => this.audio.play('extraction.progress'));

    // ── Onboarding ─────────────────────────────────────────────────────────
    // Hints fire on the *situation*, once ever. There is no sequence to follow
    // and nothing to fail: a player who never gets shot never sees the hint
    // about getting shot, and has lost nothing (docs/modules/onboarding.md).
    this.showHint('raidStarted');

    sim.bus.on('ai:alerted', () => this.showHint('firstContact'));
    sim.bus.on('container:searchStarted', () => this.showHint('firstContainer'));
    sim.bus.on('loot:pickedUp', () => this.showHint('firstLoot'));
    sim.bus.on('anomaly:entered', () => this.showHint('firstAnomaly'));
    sim.bus.on('door:locked', () => this.showHint('firstLockedDoor'));
    sim.bus.on('weapon:jammed', () => this.showHint('firstJam'));
    sim.bus.on('extraction:opened', () => this.showHint('extractionOpened'));
    sim.bus.on('boss:engaged', () => this.showHint('firstBoss'));
    sim.bus.on('raid:timeWarning', () => this.showHint('timeWarning'));

    sim.bus.on('loot:rejected', (event) => {
      if (event.reason === 'overweight') this.showHint('overweight');
    });

    sim.bus.on('damage:dealt', (event) => {
      if (!event.isPlayerTarget) return;
      this.showHint('firstDamage');
    });

    sim.bus.on('player:healthChanged', (event) => {
      if (event.max > 0 && event.current / event.max < 0.3) this.showHint('lowHealth');
    });

    sim.bus.on('extraction:opened', (event) => {
      this.hud?.showBanner(tf('{zone} offen', { zone: t(event.name) }));
      this.audio.play('extraction.open');
      this.haptics.impact('light');
    });

    sim.bus.on('extraction:closing', (event) => {
      this.hud?.showBanner(
        tf('Ausgang schließt in {seconds} s', { seconds: Math.round(event.secondsLeft) }),
        2600,
      );
    });

    sim.bus.on('raid:timeWarning', (event) => {
      this.hud?.showBanner(
        tf('Noch {minutes} Minuten', { minutes: Math.round(event.secondsLeft / 60) }),
        2600,
      );
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
      this.ui.toast(t('Zu schwer. Etwas zurücklassen.'));
      this.audio.play('loot.denied');
    });

    sim.bus.on('loot:pickedUp', (event) => {
      const def = findItem(event.itemId);
      if (def) this.ui.toast(`${t(def.name)} ×${event.quantity}`, 1200);
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
        this.ui.toast(t('Schloss entriegelt.'), 1400);
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
      this.ui.toast(
        key ? tf('Verschlossen. Benötigt: {key}', { key: t(key) }) : t('Verschlossen.'),
        2200,
      );
      this.audio.play('door.locked');
    });
  }

  private exitRaid(): void {
    // Abandoned, reloaded, or already recorded by finishRaid(). Either way the
    // listeners have to go, or the next raid inherits them.
    this.recorder?.cancel();
    this.recorder = null;

    this.ui.clearOverlays();
    this.ui.setHud(null);
    this.hud?.destroy();
    this.hud = null;

    this.renderer.teardown();
    this.sim?.dispose();
    this.sim = null;
    this.hudViewModel = null;
    this.audio.setAmbience('base');
  }

  private finishRaid(): void {
    const outcome = this.sim?.outcome;
    if (!outcome) return;

    if (this.recorder) {
      this.telemetry = recordRaid(this.telemetry, this.recorder.finish(outcome));
      this.recorder = null;
      void this.saveTelemetry();
    }

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

  /**
   * Show a hint if this situation has not come up before.
   *
   * Uses the banner rather than a toast: a hint is worth a beat of the player's
   * attention, and the banner is the one element already reserved for exactly
   * that. Saving is deferred to the next ordinary save - a hint is not worth a
   * write to storage mid-fight.
   *
   * Hints queue instead of overwriting each other. A first firefight can easily
   * trigger contact, damage and low health within a second, and a hint the
   * player never got to read is worse than no hint at all - it consumed its one
   * chance to be shown.
   */
  private showHint(trigger: HintTrigger): void {
    const hint = takeHint(this.profile, trigger);
    if (!hint) return;

    this.hintQueue.push(hint);
    // Most urgent first: low health outranks "containers make noise".
    this.hintQueue.sort((a, b) => b.priority - a.priority);
    this.drainHints();
  }

  private drainHints(): void {
    if (this.hintUntil > performance.now()) return;

    const hint = this.hintQueue.shift();
    if (!hint) return;

    this.hintUntil = performance.now() + hint.seconds * 1000;
    this.hud?.showBanner(t(hint.text), hint.seconds * 1000);
  }

  /** Surface what the settlement did beyond moving loot. */
  private reportSettlement(report: SettlementReport): void {
    for (const completion of report.questCompletions) {
      this.ui.toast(tf('Auftrag abgeschlossen: {stage}', { stage: t(completion.stage.name) }), 3200);
    }
    if (report.insuranceReturns.length > 0) {
      this.ui.toast(
        tf('Versicherung: {count} Teile in {minutes} min zurück.', {
          count: report.insuranceReturns.length,
          minutes: report.insuranceMinutes,
        }),
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
        onSelectLocale: (locale) => {
          this.closeOverlays();
          void this.applyLocale(locale);
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
        this.ui.toast(t('Nicht genug im Lager.'));
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

  /**
   * The language the player last chose, or the one their device suggests.
   *
   * Stored separately from the profile: a language is a property of the person,
   * not of the character, and resetting a profile must not switch the menus
   * back to German mid-session.
   */
  private async loadLocale(): Promise<Locale> {
    const stored = await this.storage.get(LOCALE_KEY);
    if (stored === 'de' || stored === 'en') return stored;

    const preferred = globalThis.navigator?.language ?? '';
    return preferred.toLowerCase().startsWith('de') ? 'de' : 'en';
  }

  /** Switch language and redraw whatever is on screen. */
  private async applyLocale(locale: Locale): Promise<void> {
    this.settings.locale = locale;
    setLocale(locale);
    await this.storage.set(LOCALE_KEY, locale);
    // Screens are built once and cached, so the current one has to be rebuilt.
    this.states.reenter();
  }

  private async saveProfile(): Promise<void> {
    await this.storage.set(SAVE_KEY, serialize(createSave(this.profile, Date.now())));
  }

  private async loadTelemetry(): Promise<void> {
    this.telemetry = parseTelemetry(await this.storage.get(TELEMETRY_KEY));
  }

  private async saveTelemetry(): Promise<void> {
    await this.storage.set(TELEMETRY_KEY, JSON.stringify(this.telemetry));
  }

  /**
   * Take balance numbers from a config server, if this build has one.
   *
   * Silent by design in the normal case: a build with no configured URL does
   * nothing at all, and a reachable server that returns nothing usable is
   * indistinguishable from that.
   *
   * Rejections are warnings so they survive the production log level, which is
   * `Warn` (`main.ts`) - a config the server considers deployed and the game
   * quietly ignored is the failure mode worth being loud about. "Which numbers
   * am I playing with" is answered on the Diagnose screen instead of in a
   * console line nobody can read on a phone.
   */
  private async applyRemoteBalance(): Promise<void> {
    const patch = await createRemoteConfig().fetch();
    if (patch === null) return;

    const report = applyBalanceOverlay(patch);
    if (report.applied.length > 0) {
      log.info(`Balance-Konfiguration ${balanceVersion()}: ${report.applied.length} Werte angepasst.`);
    }
    for (const rejected of report.rejected) {
      log.warn(`Balance-Konfiguration verworfen: ${rejected.group}.${rejected.key} (${rejected.reason})`);
    }
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
    this.ui.toast(t('Notausrüstung aus Basisbestand ausgegeben.'), 3600);
  }
}
