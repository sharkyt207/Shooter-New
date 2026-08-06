/**
 * Localisation.
 *
 * **German is the source language, not a translation of one.** The game was
 * written in German, the flavour text reads well in German, and the catalogue
 * below is keyed by the German string itself rather than by an identifier.
 *
 * That choice is the whole design, and it buys three things:
 *
 * 1. **There is no German catalogue to maintain.** A key with a missing entry
 *    cannot show `ui.base.title` to a German player, because the key *is* the
 *    German text. The worst possible failure is that an English player sees one
 *    German word - which is a blemish, not a broken screen.
 * 2. **Call sites stay readable.** `t('Ausrüstung wählen')` says what it
 *    renders. `t('ui.loadout.confirm')` requires a lookup to review.
 * 3. **Adding a language is one file.** No renaming, no key discipline, no
 *    coordination between the person writing the screen and the person writing
 *    the catalogue.
 *
 * The cost is the classic one: two German strings that need different English
 * collide. `context` solves it exactly as gettext's `msgctxt` does, and
 * `i18n.test.ts` proves every call site is covered.
 */

export type Locale = 'de' | 'en';

/** Translations away from the source language, keyed by the German string. */
export type Catalogue = Readonly<Record<string, string>>;

/**
 * Build a disambiguated catalogue key.
 *
 * Exported so a catalogue can write `[contextKey('toast', 'Verschlossen')]`
 * instead of embedding a control character in a string literal.
 */
export function contextKey(context: string, source: string): string {
  return `${context}\u0004${source}`;
}

const catalogues: Partial<Record<Locale, Catalogue>> = {};

let current: Locale = 'de';
const listeners = new Set<() => void>();

export function registerCatalogue(locale: Locale, catalogue: Catalogue): void {
  catalogues[locale] = catalogue;
}

export function getLocale(): Locale {
  return current;
}

/** Change language. Notifies listeners so open screens can redraw. */
export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  for (const listener of listeners) listener();
}

/** Subscribe to language changes. Returns an unsubscribe function. */
export function onLocaleChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Translate.
 *
 * `context` disambiguates two German strings that need different English -
 * "Lager" is both the stash and a storage bay. It is looked up as
 * `contextsource`, the same separator gettext uses, and falls back to the
 * uncontextualised entry before falling back to German.
 */
export function t(source: string, context?: string): string {
  if (current === 'de') return source;

  const catalogue = catalogues[current];
  if (!catalogue) return source;

  if (context !== undefined) {
    const contextual = catalogue[`${context}${source}`];
    if (contextual !== undefined) return contextual;
  }
  return catalogue[source] ?? source;
}

/**
 * Translate with substitutions: `t2('Noch {n} Minuten', { n: 3 })`.
 *
 * Placeholders rather than string concatenation, because word order differs
 * between languages and a concatenated sentence cannot be reordered by a
 * translator.
 */
export function tf(
  source: string,
  values: Readonly<Record<string, string | number>>,
  context?: string,
): string {
  const template = t(source, context);
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Every source string the active catalogue knows. Used by the coverage test. */
export function catalogueFor(locale: Locale): Catalogue | undefined {
  return catalogues[locale];
}

export const AVAILABLE_LOCALES: ReadonlyArray<{ id: Locale; label: string }> = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
];
