/**
 * Onboarding.
 *
 * The game refuses to explain itself in menus (docs/08-UI-UX.md), so it
 * explains itself *in the moment*: a hint fires the first time a situation
 * arises, once ever, and then never again.
 *
 * Three rules shape every line below.
 *
 * **Trigger on the situation, not on a step.** There is no tutorial sequence to
 * follow and nothing to fail. A player who never gets shot never sees the hint
 * about being shot, and has lost nothing.
 *
 * **Say what to do, not what happened.** The screen already shows what
 * happened. "Du wurdest getroffen" is a caption; "Deckung ist eine Wand, keine
 * Distanz" is a hint.
 *
 * **Once, ever.** Seen hints live in the profile, so a hint the player has read
 * does not come back next raid. Fifty repetitions of a tip is how a game
 * teaches people to dismiss text without reading it.
 */

export type HintTrigger =
  | 'raidStarted'
  | 'firstContact'
  | 'firstDamage'
  | 'firstContainer'
  | 'firstLoot'
  | 'overweight'
  | 'firstAnomaly'
  | 'firstLockedDoor'
  | 'firstJam'
  | 'extractionOpened'
  | 'lowHealth'
  | 'firstBoss'
  | 'timeWarning';

export interface HintDef {
  id: string;
  trigger: HintTrigger;
  text: string;
  /** Milliseconds on screen. Long enough to read once, mid-fight. */
  seconds: number;
  /** Higher wins when two hints fire on the same tick. */
  priority: number;
}

export const HINTS: readonly HintDef[] = [
  {
    id: 'hint_start',
    trigger: 'raidStarted',
    text: 'Links laufen, rechts zielen. Der Ausgang öffnet sich erst nach einigen Minuten.',
    seconds: 6,
    priority: 1,
  },
  {
    id: 'hint_contact',
    trigger: 'firstContact',
    text: 'Sie haben dich gehört. Sichtlinie brechen wirkt besser als schneller schießen.',
    seconds: 5,
    priority: 4,
  },
  {
    id: 'hint_damage',
    trigger: 'firstDamage',
    text: 'Deckung ist eine Wand, keine Distanz. Heilen kostet Zeit, in der du nichts kannst.',
    seconds: 5,
    priority: 5,
  },
  {
    id: 'hint_container',
    trigger: 'firstContainer',
    text: 'Durchsuchen dauert und macht Geräusche. Halte gedrückt.',
    seconds: 5,
    priority: 3,
  },
  {
    id: 'hint_loot',
    trigger: 'firstLoot',
    text: 'Alles wiegt etwas. Schwer heißt langsam, und langsam heißt tot.',
    seconds: 5,
    priority: 3,
  },
  {
    id: 'hint_overweight',
    trigger: 'overweight',
    text: 'Zu schwer. Entscheide, was wirklich mitkommt — im Inventar ablegen.',
    seconds: 6,
    priority: 6,
  },
  {
    id: 'hint_anomaly',
    trigger: 'firstAnomaly',
    text: 'Eine Anomalie. Ihre Farbe sagt dir, was sie tut — und daneben liegt meist etwas Gutes.',
    seconds: 6,
    priority: 5,
  },
  {
    id: 'hint_locked',
    trigger: 'firstLockedDoor',
    text: 'Verschlossen. Der Schlüssel liegt woanders in diesem Riss.',
    seconds: 5,
    priority: 4,
  },
  {
    id: 'hint_jam',
    trigger: 'firstJam',
    text: 'Ladehemmung. Abgenutzte Waffen klemmen — reparieren lohnt sich.',
    seconds: 5,
    priority: 6,
  },
  {
    id: 'hint_extraction',
    trigger: 'extractionOpened',
    text: 'Ein Ausgang ist offen. Er schließt wieder. Der nächste liegt tiefer im Riss.',
    seconds: 6,
    priority: 5,
  },
  {
    id: 'hint_lowHealth',
    trigger: 'lowHealth',
    text: 'Wenig Leben. Mit voller Tasche rauszukommen zählt mehr als der nächste Kill.',
    seconds: 5,
    priority: 7,
  },
  {
    id: 'hint_boss',
    trigger: 'firstBoss',
    text: 'Ein Wächter. Er wird schneller, je weniger Leben er hat. Weglaufen ist erlaubt.',
    seconds: 6,
    priority: 7,
  },
  {
    id: 'hint_time',
    trigger: 'timeWarning',
    text: 'Die Zeit läuft ab. Wer im Riss bleibt, verliert alles Mitgeführte.',
    seconds: 5,
    priority: 6,
  },
];

export function hintFor(trigger: HintTrigger): HintDef | undefined {
  return HINTS.find((hint) => hint.trigger === trigger);
}

export const ALL_HINT_IDS: readonly string[] = HINTS.map((hint) => hint.id);
