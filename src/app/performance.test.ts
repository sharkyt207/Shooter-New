/**
 * The performance budget from docs/01-ARCHITECTURE.md §8, enforced.
 *
 * A budget nobody measures is a budget that drifts. These tests assert against
 * the *published* numbers (3.0 ms simulation, 1.5 ms UI) rather than against
 * today's measurements, for two reasons:
 *
 * 1. The real figures beat the budget by more than an order of magnitude, so
 *    even a CI machine ten times slower than this one still passes. A perf test
 *    that fails on a loaded build agent teaches people to ignore perf tests.
 * 2. What they actually guard against is a *category* of mistake - an accidental
 *    O(n²) over entities, a per-frame allocation storm - not a few per cent of
 *    drift, which no measurement on this hardware could honestly detect anyway.
 *
 * Everything here is a desktop number. The device figures that matter come from
 * a real phone, and `scripts/measure-frame.mjs` is what collects them.
 *
 * The file lives in `app/` rather than next to the simulation because it
 * measures the *frame* - simulation and view model together - and `app` is the
 * layer that owns the frame. The boundary checker made that call for us:
 * `game` may not import `ui`, and a test is not exempt from the architecture.
 */

import { describe, expect, it } from 'vitest';
import { addItem } from '@/game/inventory/inventory';
import { createEmptyLoadout, type Loadout } from '@/game/player/loadout';
import { createIntent } from '@/game/player/playerIntent';
import { RaidSimulation } from '@/game/simulation/raidSimulation';
import { buildHudViewModel } from '@/ui/viewModel';
import type { EntityId } from '@/core/ecs/entity';

/** docs/01-ARCHITECTURE.md §8 */
const SIM_BUDGET_MS = 3.0;
const UI_BUDGET_MS = 1.5;
const ENTITY_BUDGET = 300;

function loadout(): Loadout {
  return {
    ...createEmptyLoadout(),
    weaponItemId: 'itm_wpn_splitter',
    armorItemId: 'itm_armor_fiber',
    backpackItemId: 'itm_bag_medium',
    preferredAmmoItemId: 'itm_ammo_9mm',
    carried: [{ itemId: 'itm_ammo_9mm', quantity: 300 }],
  };
}

/** A raid warmed up into its expensive state: enemies awake, rounds in flight. */
function busyRaid(seed: number): RaidSimulation {
  const sim = new RaidSimulation({ seed, loadout: loadout() });

  const player = sim.world.playerEntity as EntityId;
  const carrier = sim.world.carriers.require(player);
  for (const id of ['itm_scrap', 'itm_copper', 'itm_circuit', 'itm_polymer', 'itm_bandage']) {
    addItem(carrier.inventory, id, 5);
  }

  const intent = createIntent();
  intent.fire = true;
  for (let i = 0; i < 180; i++) {
    sim.applyIntent(intent);
    sim.step();
  }
  return sim;
}

describe('performance budget', () => {
  it('runs a simulation tick well inside 3 ms', () => {
    const intent = createIntent();
    intent.fire = true;

    let worst = 0;
    for (const seed of [42, 5001, 11]) {
      const sim = busyRaid(seed);

      const runs = 600;
      const start = performance.now();
      for (let i = 0; i < runs; i++) {
        sim.applyIntent(intent);
        sim.step();
      }
      const perTick = (performance.now() - start) / runs;
      worst = Math.max(worst, perTick);
    }

    expect(worst, `${worst.toFixed(3)} ms/tick`).toBeLessThan(SIM_BUDGET_MS);
  });

  it('builds the HUD view model well inside the UI budget', () => {
    const sim = busyRaid(5001);

    const runs = 1000;
    const start = performance.now();
    for (let i = 0; i < runs; i++) buildHudViewModel(sim);
    const perFrame = (performance.now() - start) / runs;

    expect(perFrame, `${perFrame.toFixed(4)} ms/frame`).toBeLessThan(UI_BUDGET_MS);
  });

  it('stays under the entity budget on a busy raid', () => {
    for (const seed of [42, 5001, 11, 90210]) {
      const sim = busyRaid(seed);
      expect(sim.world.transforms.size, `seed ${seed}`).toBeLessThanOrEqual(ENTITY_BUDGET);
    }
  });

  it('does not leak entities over a long raid', () => {
    // Projectiles, throwables and loot are all created and destroyed
    // constantly. A leak here would be invisible for the first minute and
    // fatal by minute ten.
    const sim = busyRaid(5001);
    const intent = createIntent();
    intent.fire = true;

    const after180 = sim.world.transforms.size;
    for (let i = 0; i < 1800; i++) {
      sim.applyIntent(intent);
      sim.step();
    }

    expect(sim.world.transforms.size).toBeLessThanOrEqual(after180 + 40);
  });
});
