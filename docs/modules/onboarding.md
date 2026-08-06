# Modul: Onboarding

> Schicht 1 (`content/hints.ts`) + Schicht 2 (`game/base/onboarding.ts`)
> · Status 🟢 M7 abgeschlossen

## Zweck

Dem Spieler beibringen, wie das Spiel funktioniert, ohne es ihm zu erklären.

## Kein Tutorial

Es gibt keine Tutorial-Sequenz, keine geführte Erstmission und nichts, was man
verpassen kann. Stattdessen feuert ein Hinweis **beim ersten Auftreten einer
Situation** — einmal, für immer.

Drei Regeln formen jede Zeile:

**Auslöser ist die Situation, nicht ein Schritt.** Wer nie getroffen wird, sieht
den Hinweis zum Getroffenwerden nie und hat nichts verpasst. Ein Tutorial mit
Schritten erzwingt eine Reihenfolge, die das Spiel selbst nicht hat — in einem
prozedural erzeugten Riss gibt es keine dritte Tür von links.

**Sagen, was zu tun ist, nicht was passiert ist.** Der Bildschirm zeigt bereits,
was passiert ist. „Du wurdest getroffen" ist eine Bildunterschrift; „Deckung ist
eine Wand, keine Distanz" ist ein Hinweis. Ein Test prüft die offensichtlichste
Form des Rückfalls.

**Einmal, für immer.** Gesehene Hinweise stehen im Profil und überstehen jeden
Raid und jeden Neustart. Fünfzig Wiederholungen eines Tipps sind die Methode,
mit der ein Spiel seinen Spielern beibringt, Text ungelesen wegzuklicken.

## Auslöser

| Auslöser | Kommt von | Sagt |
|----------|-----------|------|
| `raidStarted` | Raid-Beginn | Steuerung, und dass der Ausgang später kommt |
| `firstContact` | `ai:alerted` | Sichtlinie brechen schlägt schneller schießen |
| `firstDamage` | `damage:dealt` am Spieler | Deckung ist eine Wand; Heilen kostet Zeit |
| `firstContainer` | `container:searchStarted` | Durchsuchen dauert und macht Geräusche |
| `firstLoot` | `loot:pickedUp` | Alles wiegt etwas |
| `overweight` | `loot:rejected` | Entscheiden, was mitkommt |
| `firstAnomaly` | `anomaly:entered` | Farbe sagt Wirkung; daneben liegt etwas Gutes |
| `firstLockedDoor` | `door:locked` | Der Schlüssel liegt woanders im Riss |
| `firstJam` | `weapon:jammed` | Abgenutzte Waffen klemmen |
| `extractionOpened` | `extraction:opened` | Er schließt wieder |
| `lowHealth` | `player:healthChanged` < 30 % | Rauskommen zählt mehr als der nächste Kill |
| `firstBoss` | `boss:engaged` | Er wird schneller; Weglaufen ist erlaubt |
| `timeWarning` | `raid:timeWarning` | Wer bleibt, verliert alles Mitgeführte |

Jeder einzelne hängt an einem Ereignis, das der Raid **ohnehin schon sendet**.
Kein System musste für das Onboarding einen Haken wachsen lassen — dasselbe
Prinzip wie bei der Questlinie (docs/modules/base.md).

## Warteschlange statt Überschreiben

Ein erstes Feuergefecht löst leicht `firstContact`, `firstDamage` und
`lowHealth` innerhalb einer Sekunde aus. Hinweise reihen sich deshalb ein statt
sich zu überschreiben, sortiert nach Priorität: Wenig Leben schlägt „Behälter
machen Geräusche".

Ein Hinweis, den der Spieler nie zu lesen bekam, ist schlimmer als keiner — er
hat seine einzige Gelegenheit verbraucht.

## Lesbarkeit

Ein Test rechnet nach: höchstens 20 Zeichen pro Sekunde Anzeigedauer, mindestens
vier Sekunden. Mitten im Gefecht, auf einem Telefon, ist das die Grenze. Ein
Hinweis, den man nicht zu Ende lesen kann, hat seine Gelegenheit für nichts
verbraucht.

## Datenmodell

```ts
// content
interface HintDef { id, trigger, text, seconds, priority }

// profile
seenHints: string[]     // JSON-fähig, nie lang genug für eine Set-Optimierung
```

Ein Hinweis, den ein Patch entfernt hat, wird beim Laden aus `seenHints`
verworfen — er kann ohnehin nie wieder feuern.

## Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| Situations-Hinweise statt Tutorial-Sequenz | Ein prozeduraler Riss hat keine dritte Tür von links |
| Einmal, für immer, im Profil | Wiederholung bringt Spielern bei, Text zu ignorieren |
| Warteschlange mit Priorität | Drei Hinweise in einer Sekunde sind der Normalfall, nicht der Ausnahmefall |
| Banner statt Toast | Ein Hinweis ist einen Moment Aufmerksamkeit wert; dafür gibt es das Banner |
| Kein Speichern beim Auslösen | Ein Hinweis ist keinen Schreibvorgang mitten im Gefecht wert |
| Ausschließlich vorhandene Ereignisse | Kein System wurde für das Onboarding verändert |

## Tests

`src/game/base/onboarding.test.ts` — feuert einmal und nie wieder, Hinweise sind
voneinander unabhängig, überstehen einen Speicher-Roundtrip, lassen sich
zurücksetzen; dazu die Inhaltsprüfungen: eindeutige IDs, ein Auslöser pro
Hinweis, Lesbarkeit in der Anzeigedauer, jeder Auslöser der App auflösbar.

## Offen / nächster Schritt

- Hinweise in der Basis (erster Ausbau, erster Auftrag, erste Versicherung)
- Ein Schalter in den Einstellungen, um sie zurückzusetzen — `resetHints()`
  existiert bereits, es fehlt nur die Schaltfläche
- Übersetzung, sobald die Lokalisierung steht
