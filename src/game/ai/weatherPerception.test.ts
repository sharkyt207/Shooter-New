/**
 * Weather is a single dial that changes which approach a raid rewards.
 *
 * The design rule it has to obey: never purely bad. Fog cuts sight for the
 * enemy exactly as much as for the player, and a storm that swallows the
 * player's footsteps swallows the enemy's too.
 */

import { describe, expect, it } from 'vitest';
import { LIGHT } from '@/content/balance';
import { getWeather, type WeatherDef } from '@/content/weather';
import type { EntityId } from '@/core/ecs/entity';
import { audibleRadius } from '@/game/ai/perception';
import type { Loadout } from '@/game/player/loadout';
import { createIntent } from '@/game/player/playerIntent';
import { RaidSimulation } from '@/game/simulation/raidSimulation';

function loadout(): Loadout {
  return {
    weaponItemId: 'itm_wpn_splitter',
    armorItemId: null,
    helmetItemId: null,
    backpackItemId: 'itm_bag_medium',
    attachments: {},
    preferredAmmoItemId: 'itm_ammo_9mm',
    weaponCondition: 1,
    carried: [{ itemId: 'itm_ammo_9mm', quantity: 30 }],
  };
}

/** A context stub carrying just what `audibleRadius` reads. */
function hearingContext(sim: RaidSimulation, weather: WeatherDef): never {
  return { grid: sim.grid, weather } as never;
}

describe('weather and hearing', () => {
  it('lets a storm swallow sound and fog carry it', () => {
    const sim = new RaidSimulation({ seed: 8080, loadout: loadout() });
    const spawn = sim.map.playerSpawn;

    const clear = audibleRadius(hearingContext(sim, getWeather('clear')), 20, spawn.x, spawn.y, spawn.x + 1, spawn.y);
    const storm = audibleRadius(hearingContext(sim, getWeather('storm')), 20, spawn.x, spawn.y, spawn.x + 1, spawn.y);
    const fog = audibleRadius(hearingContext(sim, getWeather('fog')), 20, spawn.x, spawn.y, spawn.x + 1, spawn.y);

    expect(storm).toBeLessThan(clear);
    expect(fog).toBeGreaterThan(clear);
  });
});

describe('weather and sight', () => {
  it('never makes a raid impossible', () => {
    // Every weather has to leave enough sight and hearing to play with.
    for (const id of ['clear', 'fog', 'storm', 'riftpulse', 'night'] as const) {
      const weather = getWeather(id);
      expect(weather.visionMultiplier).toBeGreaterThanOrEqual(0.5);
      expect(weather.hearingMultiplier).toBeGreaterThanOrEqual(0.5);
      expect(weather.lightMultiplier).toBeGreaterThan(0.25);
    }
  });
});

describe('the flashlight', () => {
  it('starts on when the fragment is dark and off when it is not', () => {
    let sawDark = 0;
    let sawLit = 0;

    for (let seed = 0; seed < 60; seed++) {
      const sim = new RaidSimulation({ seed, loadout: loadout() });
      const player = sim.world.playerEntity as EntityId;
      const tag = sim.world.players.require(player);
      const dark = sim.weather.lightMultiplier < LIGHT.darkThreshold;

      expect(tag.lightOn).toBe(dark);
      if (dark) sawDark++;
      else sawLit++;
    }

    // Both cases must occur, or the mechanic never comes up.
    expect(sawDark).toBeGreaterThan(0);
    expect(sawLit).toBeGreaterThan(0);
  });

  it('toggles from the intent, one flip per press', () => {
    const sim = new RaidSimulation({ seed: 12345, loadout: loadout() });
    const player = sim.world.playerEntity as EntityId;
    const tag = sim.world.players.require(player);
    const before = tag.lightOn;

    const intent = createIntent();
    intent.toggleLight = true;
    sim.applyIntent(intent);
    sim.step();
    expect(tag.lightOn).toBe(!before);

    // Holding the button down must not strobe it - the flag is a one-shot.
    sim.applyIntent(createIntent());
    sim.step();
    sim.applyIntent(createIntent());
    sim.step();
    expect(tag.lightOn).toBe(!before);
  });
});
