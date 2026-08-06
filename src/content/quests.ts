/**
 * "Kartographie der Risse" — the one quest line.
 *
 * There is exactly one, and it is not a story so much as a curriculum. Each
 * stage teaches a system the game has just made available, in the order a new
 * player meets them: get out alive, fight, carry something valuable home, open
 * a vault, stand in an anomaly on purpose, build something, upgrade the base.
 *
 * That ordering is the whole design. The game refuses to explain itself in
 * menus (docs/08-UI-UX.md), so the quest line is where "you can do this" is
 * said out loud — once, and then never again.
 *
 * Progress is fed exclusively by facts the raid already reports, so no system
 * had to grow a hook for the quest line to exist.
 */

import type { QuestStageDef } from './types';

export const QUEST_LINE_NAME = 'Kartographie der Risse';

export const QUEST_STAGES: readonly QuestStageDef[] = [
  {
    id: 'q_first_extraction',
    name: 'Erster Rückweg',
    description: 'Verlasse einen Riss lebend. Alles Weitere setzt das voraus.',
    goal: { kind: 'extract', target: 1 },
    rewardCredits: 600,
    rewardXp: 150,
    rewardItems: [{ itemId: 'itm_bandage', quantity: 3 }],
  },
  {
    id: 'q_clear_the_way',
    name: 'Freie Bahn',
    description: 'Schalte 15 Feinde aus. Die Risse gehören niemandem freiwillig.',
    goal: { kind: 'kills', target: 15 },
    rewardCredits: 1200,
    rewardXp: 240,
    rewardItems: [{ itemId: 'itm_ammo_9mm', quantity: 60 }],
  },
  {
    id: 'q_worth_the_trip',
    name: 'Die Fracht',
    description: 'Bringe Beute im Wert von 8.000 Credits aus den Rissen zurück.',
    goal: { kind: 'extractValue', target: 8000 },
    rewardCredits: 2200,
    rewardXp: 380,
  },
  {
    id: 'q_locked_door',
    name: 'Hinter der verschlossenen Tür',
    description: 'Öffne eine Sicherheitskammer. Der Schlüssel liegt woanders im Riss.',
    goal: { kind: 'openVault', target: 1 },
    rewardCredits: 3000,
    rewardXp: 450,
    rewardItems: [{ itemId: 'itm_key_vault', quantity: 1 }],
  },
  {
    id: 'q_into_the_field',
    name: 'Feldstudie',
    description: 'Betritt drei Anomalien und komm lebend wieder heraus.',
    goal: { kind: 'surviveAnomaly', target: 3 },
    rewardCredits: 3600,
    rewardXp: 520,
    rewardItems: [{ itemId: 'itm_echoshard', quantity: 3 }],
  },
  {
    id: 'q_own_supply',
    name: 'Eigene Fertigung',
    description: 'Stelle fünf Gegenstände selbst her.',
    goal: { kind: 'craft', target: 5 },
    rewardCredits: 4200,
    rewardXp: 600,
  },
  {
    id: 'q_the_base',
    name: 'Ein fester Ort',
    description: 'Bringe die Werkbank auf Stufe 3. Von hier aus wird kartiert.',
    goal: { kind: 'moduleLevel', target: 3, moduleId: 'base_workbench' },
    rewardCredits: 8000,
    rewardXp: 900,
    rewardItems: [{ itemId: 'itm_case_small', quantity: 1 }],
  },
];

export function questStageAt(index: number): QuestStageDef | undefined {
  return QUEST_STAGES[index];
}

export const QUEST_STAGE_COUNT = QUEST_STAGES.length;
