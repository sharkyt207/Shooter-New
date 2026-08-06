# Modul: game/crafting

> Schicht 2 · Status 🟢 M5 abgeschlossen

## Zweck

Die Werkbank: aus Schrott wird Ausrüstung, aus Ausrüstung wird ein Rückweg.
Seit M5 mit Zeit, Fehlschlagquote und mehreren gleichzeitigen Aufträgen.

## Öffentlicher Vertrag

```ts
startCraft(profile, recipeId, now): CraftStartResult
collectCrafts(profile, now): CraftOutcome[]
craftProgress(job, now): number            // 0..1
craftSlots(profile): number                // 1 pro Werkbank-Stufe
failureChanceFor(profile, recipe): number  // nach Modulbonus
availableRecipes(profile): RecipeDef[]
```

## Zeit

Die Zutaten werden **beim Start** verbraucht, das Ergebnis erscheint **am
Ende**. Vorne zu verbrauchen macht aus einem eingereihten Auftrag eine
Verpflichtung statt einer Reservierung — und hält das Lager ehrlich: Was
eingereiht ist, ist auch weg.

Billige Verbrauchsgüter bleiben sofort verfügbar. Niemand sollte einen Verband
einplanen müssen. Alles darüber läuft in Minuten und tickt während des Raids
weiter, so wie die Bauwarteschlange.

## Fehlschlag

Ein fehlgeschlagener Auftrag gibt `META.craftFailureRefund` (60 %) des Materials
zurück. Diese Zahl ist absichtlich hoch.

Ein Fehlschlag, der einen Vormittag Looten kostet, lehrt keine Vorsicht — er
lehrt, nie wieder zu craften, und die Werkbank wird zur Zierde. Was ein
Fehlschlag kosten *soll*, ist **Zeit** und ein bisschen Material: beides
planbar.

Jede Modulstufe über der Rezeptanforderung nimmt ein Drittel der
Fehlschlagquote weg. Investition in die Basis verwandelt damit ein Glücksspiel
in eine Lieferkette. Die Quote steht in der UI — eine verborgene Fehlerquote
liest sich wie ein schummelndes Spiel.

## Determinismus

Der Wurf passiert **beim Start** und liegt auf dem Auftrag.

Beim Einsammeln zu würfeln hieße, dass ein Spieler den Speicherstand so lange
neu lädt, bis der Auftrag gelingt. Ein System, das sich per Save-Scumming
aushebeln lässt, kann seine Fehlschlagquote auch gleich weglassen. Gewürfelt
wird aus `profile.metaSeed`, der bei jedem Zug weiterrückt — `Math.random()` ist
in `game/**` ohnehin verboten (ADR-009).

## Datenmodell

```ts
interface RecipeDef {
  requires: { moduleId, level },
  inputs: { itemId, quantity }[],
  output: { itemId, quantity },
  craftSeconds: number,
  failureChance?: number,     // vor dem Modulbonus
}

interface CraftJob { id, recipeId, readyAt, failed }
```

## Rezepte nach Modul

| Modul | Stufe | Rezepte |
|-------|-------|---------|
| Werkbank | 1 | Feldverband (sofort), 9 mm Kern |
| Werkbank | 2 | 7,4 Riss, Faserweste |
| Medizin | 2 | Trauma-Kit |
| Waffenwerkstatt | 1 | 9 mm Stahlkern, Reflexvisier |
| Waffenwerkstatt | 2 | Bruch M9 |
| Forschung | 2 | Sicherungskassette |

Die Sicherungskassette hinter der Forschung zu sperren ist Absicht: Der sichere
Behälter ist das stärkste Objekt des Spiels und soll ein Ziel sein, kein
Startgegenstand.

## Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| Zutaten beim Start, Ergebnis am Ende | Macht aus der Warteschlange eine Verpflichtung; das Lager lügt nie |
| Fehlschlag gibt 60 % zurück | Kosten sollen Zeit sein, nicht ein Vormittag Beute |
| Wurf beim Start, gespeichert am Auftrag | Sonst ist die Fehlschlagquote per Neuladen abwählbar |
| Fehlschlagquote sichtbar in der UI | Eine verborgene Quote liest sich wie Betrug |
| Slots pro Werkbankstufe | Der Ausbau bringt Durchsatz, nicht nur neue Rezepte |
| Verbrauchsgüter bleiben sofort | Einen Verband plant niemand ein |

## Tests

`game/base/metaProgression.test.ts`, Abschnitt *crafting* — Zutaten gehen sofort
und das Ergebnis kommt auf den Timer, Slot-Grenze folgt der Werkbankstufe, ein
erzwungener Fehlschlag gibt genau die erwartete Menge zurück, das Ergebnis ist
Teil des Speicherstands (also nicht neu würfelbar), die Fehlschlagquote sinkt
mit der Modulstufe und bleibt immer in 0..1.

## Offen / nächster Schritt

- Rezepte, die aus Riss-Material bestehen (Forschung Stufe 2 vorbereitet)
- Massenherstellung (×5) sobald es Rezepte gibt, bei denen sich das lohnt
