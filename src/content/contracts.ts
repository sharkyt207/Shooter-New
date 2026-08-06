/**
 * Contracts (Aufträge).
 *
 * A contract turns loot the player already has into a *reason* — the difference
 * between "I found four circuits" and "I found four circuits and somebody is
 * waiting for them". They are the cheapest way to give a raid a direction
 * without ever telling the player where to go.
 *
 * Design rules:
 *
 * - Every contract asks for something the world actually drops. A contract that
 *   cannot be completed is worse than no contract at all.
 * - Rewards lean on reputation and XP rather than credits. Contracts should
 *   pull the player *towards* a trader, not replace the trader's business.
 * - Nothing is timed. A countdown on a mobile game is a way of punishing people
 *   for having a life (docs/08-UI-UX.md).
 */

import type { ContractTemplate } from './types';

export const CONTRACT_TEMPLATES: readonly ContractTemplate[] = [
  {
    id: 'ct_scrap_run',
    traderId: 'trd_quartermaster',
    name: 'Materialbeschaffung',
    deliver: [{ itemId: 'itm_scrap', quantity: 12 }],
    rewardCredits: 900,
    rewardXp: 120,
    rewardReputation: 30,
    minLevel: 1,
  },
  {
    id: 'ct_wiring',
    traderId: 'trd_quartermaster',
    name: 'Leitfähiges Material',
    deliver: [
      { itemId: 'itm_copper', quantity: 8 },
      { itemId: 'itm_circuit', quantity: 3 },
    ],
    rewardCredits: 1600,
    rewardXp: 180,
    rewardReputation: 45,
    minLevel: 2,
  },
  {
    id: 'ct_ammo_surplus',
    traderId: 'trd_quartermaster',
    name: 'Munitionsüberschuss',
    deliver: [{ itemId: 'itm_ammo_9mm', quantity: 120 }],
    rewardCredits: 1100,
    rewardXp: 100,
    rewardReputation: 35,
    rewardItems: [{ itemId: 'itm_ammo_9mm_hp', quantity: 30 }],
    minLevel: 2,
  },
  {
    id: 'ct_field_dressing',
    traderId: 'trd_medic',
    name: 'Verbandsmaterial',
    deliver: [{ itemId: 'itm_bandage', quantity: 8 }],
    rewardCredits: 800,
    rewardXp: 110,
    rewardReputation: 50,
    minLevel: 1,
  },
  {
    id: 'ct_stabilisers',
    traderId: 'trd_medic',
    name: 'Stabilisatoren',
    deliver: [
      { itemId: 'itm_polymer', quantity: 6 },
      { itemId: 'itm_circuit', quantity: 2 },
    ],
    rewardCredits: 1900,
    rewardXp: 200,
    rewardReputation: 60,
    rewardItems: [{ itemId: 'itm_medkit', quantity: 1 }],
    minLevel: 4,
  },
  {
    id: 'ct_echo_sample',
    traderId: 'trd_medic',
    name: 'Echo-Probe',
    deliver: [{ itemId: 'itm_echoshard', quantity: 4 }],
    rewardCredits: 2400,
    rewardXp: 260,
    rewardReputation: 70,
    minLevel: 5,
  },
  {
    id: 'ct_no_questions',
    traderId: 'trd_blackmarket',
    name: 'Keine Fragen',
    deliver: [{ itemId: 'itm_datacore', quantity: 2 }],
    rewardCredits: 5200,
    rewardXp: 320,
    rewardReputation: 80,
    minLevel: 6,
  },
  {
    id: 'ct_rift_core',
    traderId: 'trd_blackmarket',
    name: 'Riss-Kern',
    deliver: [{ itemId: 'itm_risscore', quantity: 1 }],
    rewardCredits: 9000,
    rewardXp: 480,
    rewardReputation: 110,
    rewardItems: [{ itemId: 'itm_ammo_9mm_ap', quantity: 40 }],
    minLevel: 8,
  },
];

export function findContractTemplate(id: string): ContractTemplate | undefined {
  return CONTRACT_TEMPLATES.find((template) => template.id === id);
}

/** Templates a player of this level may be offered by a trader they can reach. */
export function eligibleContracts(level: number, traderIds: readonly string[]): ContractTemplate[] {
  return CONTRACT_TEMPLATES.filter(
    (template) => template.minLevel <= level && traderIds.includes(template.traderId),
  );
}
