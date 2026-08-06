/**
 * M7: localisation coverage.
 *
 * The failure mode this file exists to prevent is not a crash — a missing entry
 * falls back to German and the screen still works. It is *silence*: a game that
 * is 80 % English and nobody notices which 20 % is missing.
 *
 * So the test scans the real source for `t('…')` and `tf('…')` call sites and
 * fails when the English catalogue has no entry. It is a linter for the
 * catalogue, written as a test because that is where it will actually be run.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contextKey, getLocale, registerCatalogue, setLocale, t, tf } from '@/core/i18n/i18n';
import { EN } from './en';

// `core/i18n` itself is excluded: its documentation contains example call
// sites that are deliberately not real strings.
const SOURCE_ROOTS = ['src/ui', 'src/app'];

/** Every `.ts` file under a directory, excluding tests. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
    } else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Source strings passed to `t()` / `tf()` as literals.
 *
 * Only literal arguments can be checked; `t(def.name)` is resolved at runtime
 * and is covered by the content-completeness test further down instead.
 */
function callSites(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const pattern = /\bt f?\(|\btf?\('((?:[^'\\]|\\.)*)'/g;
  const literal = /\btf?\('((?:[^'\\]|\\.)*)'/g;

  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(literal)) {
        const source = match[1];
        if (source === undefined || source.length === 0) continue;
        const existing = found.get(source);
        if (existing) existing.push(file);
        else found.set(source, [file]);
      }
    }
  }
  void pattern;
  return found;
}

describe('the English catalogue', () => {
  it('covers every literal call site in the UI and the app', () => {
    const missing: string[] = [];

    for (const [source, files] of callSites()) {
      if (source in EN) continue;
      missing.push(`${source}   (${files[0]})`);
    }

    expect(missing, `untranslated:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('has no entry that is identical to its German source', () => {
    // A few are legitimately identical - proper nouns, "Sprint", "Debug". They
    // are listed here so that adding a new one is a deliberate act rather than
    // an unnoticed copy-paste.
    const intentional = new Set([
      'Project Echo',
      'Sprint',
      'Debug',
      'Operator',
      'Raids',
      // Invented model designations. A product name is not a description, and
      // translating one would make the catalogue read like two different games.
      'Bruch M9',
      'Nadel LR',
      'Splitter VK-2',
      'Nadel PR-9',
      'Bruch SG-40',
      '{done} / {total}',
      'Pause',
      'Name',
      'Radar',
      // Same word in both languages, and no synonym is closer.
      'Explosion',
    ]);

    const accidental = Object.entries(EN)
      .filter(([source, translated]) => source === translated && !intentional.has(source))
      .map(([source]) => source);

    expect(accidental).toEqual([]);
  });

  it('keeps every placeholder from the source string', () => {
    // Dropping a `{count}` in translation produces a sentence with a hole in
    // it, and the hole is invisible until someone plays in that language.
    for (const [source, translated] of Object.entries(EN)) {
      const wanted = [...source.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const got = [...translated.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(got, `${source} → ${translated}`).toEqual(wanted);
    }
  });
});

describe('the translation function', () => {
  it('returns the source unchanged in German', () => {
    setLocale('de');
    expect(t('Ausrüstung wählen')).toBe('Ausrüstung wählen');
    expect(getLocale()).toBe('de');
  });

  it('translates in English and falls back to German for the unknown', () => {
    registerCatalogue('en', EN);
    setLocale('en');

    expect(t('Ausrüstung wählen')).toBe('Choose loadout');
    // Never a raw key, never an empty string - the German is always a valid
    // last resort, which is the whole point of keying by source.
    expect(t('Ein Satz, den niemand übersetzt hat')).toBe('Ein Satz, den niemand übersetzt hat');

    setLocale('de');
  });

  it('substitutes placeholders', () => {
    registerCatalogue('en', EN);
    setLocale('en');
    expect(tf('Stufe {level}', { level: 4 })).toBe('Level 4');
    setLocale('de');
    expect(tf('Stufe {level}', { level: 4 })).toBe('Stufe 4');
  });

  it('leaves an unknown placeholder alone rather than emptying it', () => {
    setLocale('de');
    expect(tf('Stufe {level}', {})).toBe('Stufe {level}');
  });

  it('disambiguates with a context, unambiguously', () => {
    registerCatalogue('en', { Lager: 'Stash', [contextKey('room', 'Lager')]: 'Storage bay' });
    setLocale('en');

    expect(t('Lager')).toBe('Stash');
    expect(t('Lager', 'room')).toBe('Storage bay');
    // A context with no entry falls back to the plain one, not to the key.
    expect(t('Lager', 'nowhere')).toBe('Stash');

    // The separator must make ('roo', 'mLager') and ('room', 'Lager') different.
    expect(contextKey('roo', 'mLager')).not.toBe(contextKey('room', 'Lager'));

    registerCatalogue('en', EN);
    setLocale('de');
  });

  it('notifies listeners exactly once per real change', () => {
    let calls = 0;
    const stop = (): void => {
      /* replaced below */
    };
    void stop;

    setLocale('de');
    let count = 0;
    const unsubscribe = onLocaleChangedCounter(() => count++);

    setLocale('en');
    setLocale('en'); // no change, no notification
    setLocale('de');

    expect(count).toBe(2);
    unsubscribe();
    void calls;
  });
});

// Imported late so the describe block above reads in the order it runs.
import { onLocaleChanged as onLocaleChangedCounter } from '@/core/i18n/i18n';

/**
 * Content coverage.
 *
 * The call-site scan cannot see `t(def.name)` — the argument is only known at
 * runtime. So this walks the content catalogues directly and checks the strings
 * that actually reach a screen.
 *
 * Deliberately *not* everything: item `description` fields are flavour text the
 * UI does not currently render, and demanding a translation for a string nobody
 * sees is how a catalogue fills up with work that protects nothing.
 */
describe('content coverage', () => {
  const rendered: Array<{ label: string; strings: string[] }> = [
    { label: 'items', strings: ALL_ITEM_IDS.map((id) => getItem(id).name) },
    { label: 'weapons', strings: Object.values(WEAPONS).map((weapon) => weapon.name) },
    { label: 'enemies', strings: Object.values(ENEMIES).map((enemy) => enemy.name) },
    {
      label: 'anomalies',
      strings: ALL_ANOMALY_KINDS.flatMap((kind) => [
        getAnomaly(kind).name,
        getAnomaly(kind).description,
      ]),
    },
    {
      label: 'weather',
      strings: ALL_WEATHER_IDS.flatMap((id) => [getWeather(id).name, getWeather(id).briefing]),
    },
    {
      label: 'base modules',
      strings: ALL_BASE_MODULE_IDS.flatMap((id) => [
        getBaseModule(id).name,
        ...getBaseModule(id).levels.map((level) => level.unlocks),
      ]),
    },
    { label: 'recipes', strings: ALL_RECIPE_IDS.map((id) => getRecipe(id).name) },
    {
      label: 'traders',
      strings: ALL_TRADER_IDS.flatMap((id) => [getTrader(id).name, getTrader(id).blurb]),
    },
    { label: 'contracts', strings: CONTRACT_TEMPLATES.map((template) => template.name) },
    {
      label: 'quests',
      strings: [
        QUEST_LINE_NAME,
        ...QUEST_STAGES.flatMap((stage) => [stage.name, stage.description]),
      ],
    },
    { label: 'hints', strings: HINTS.map((hint) => hint.text) },
    {
      label: 'biomes and containers',
      strings: [
        ...ALL_BIOME_IDS.map((id) => getBiome(id).name),
        ...Object.values(CONTAINERS).map((container) => container.name),
      ],
    },
  ];

  for (const group of rendered) {
    it(`translates every ${group.label} string that reaches a screen`, () => {
      const missing = group.strings.filter((source) => !(source in EN));
      expect(missing, `untranslated ${group.label}:\n  ${missing.join('\n  ')}`).toEqual([]);
    });
  }
});

import { ALL_ANOMALY_KINDS, getAnomaly } from '@/content/anomalies';
import { ALL_BIOME_IDS, CONTAINERS, getBiome } from '@/content/biomes';
import { ALL_BASE_MODULE_IDS, ALL_RECIPE_IDS, getBaseModule, getRecipe } from '@/content/baseModules';
import { CONTRACT_TEMPLATES } from '@/content/contracts';
import { ENEMIES } from '@/content/enemies';
import { HINTS } from '@/content/hints';
import { ALL_ITEM_IDS, getItem } from '@/content/items';
import { QUEST_LINE_NAME, QUEST_STAGES } from '@/content/quests';
import { ALL_TRADER_IDS, getTrader } from '@/content/traders';
import { WEAPONS } from '@/content/weapons';
import { ALL_WEATHER_IDS, getWeather } from '@/content/weather';
