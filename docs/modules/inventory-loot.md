# Module: game/inventory, game/loot

> Schicht 2 · Status 🟢 Prototyp fertig

## Zweck

Das Inventar ist kein Nebensystem — es **ist** die Kernmechanik. „Was lasse ich
zurück?" ist die Frage, um die das ganze Spiel gebaut ist (Pillar P1).

## Gewicht statt Raster (ADR-005)

Grid-Inventare sind ein Markenzeichen des Genres und auf einem 6-Zoll-Display
ein Usability-Desaster: 1×2-Gegenstände mit dem Daumen ziehen funktioniert nicht.

Stattdessen: **Slots + Gewichtslimit.** Items haben `weight` und `stackSize`,
keine Maße. Die Spannung entsteht über das Gewichtsbudget genauso gut wie über
ein Raster — ohne Fummelei.

```ts
interface InventoryState { slots: InventorySlot[]; capacityKg: number }

addItem(inv, itemId, quantity): number   // gibt zurück, wie viel WIRKLICH passte
removeItem(inv, itemId, quantity): number
transferAll(from, to): InventorySlot[]   // gibt konsolidierte Reste zurück
```

**`addItem` gibt eine Teilmenge zurück, statt zu scheitern.** Genau daraus
entsteht das Kernerlebnis: Man hebt eine Munitionskiste auf, 34 von 60 passen,
der Rest bleibt liegen. Der Spieler trifft die Entscheidung, nicht das System.

Überladung blockiert nicht hart, sondern kostet Geschwindigkeit und Ausdauer:

```
Last ≤ 50 %  → volle Geschwindigkeit
Last = 100 % → 72 %
Last ≥ 135 % → 45 %
```

Reine Daten plus freie Funktionen — kein Klassenobjekt, damit ein Inventar
einen JSON-Roundtrip unbeschadet übersteht.

## Loot-Tabellen

```ts
rollLootTable(rng.loot, 'loot_crate_common'): RolledItem[]
```

Gewichtete Ziehung mit expliziter `emptyChance`. Die Leer-Chance ist wichtiger
als sie aussieht: Ein Behälter, der immer etwas ausspuckt, macht Looten zur
Pflichtübung statt zum Glücksspiel.

Gewöhnliche Behälter liefern überwiegend **nützliche** Dinge (Munition,
Verbandsmaterial, Schrott), damit sich jeder Raid trägt. Hochwertiges bleibt
selten genug, dass ein Fund den Plan für den restlichen Raid ändert.

Der Test erzwingt, dass Echo-Depots über 1000 Ziehungen mindestens den
dreifachen Wert gewöhnlicher Kisten liefern — sonst lohnt der Weg zur Anomalie nicht.

## Behälter

Suchen dauert (`searchSeconds`), lässt sich unterbrechen und würfelt den Inhalt
**erst beim Öffnen**. Der Inhalt fällt in einem Ring auf den Boden — nie in eine
Wand, sonst wäre er unerreichbar.

Das Aufnehmen kennt genau ein Ziel: das nächste in Reichweite. Mehrdeutige
Interaktionsziele sind der schnellste Weg, ein Touch-Spiel unzuverlässig wirken
zu lassen.

## Tests

`inventory.test.ts` (15 Tests): Gewichtsgrenzen, Teilaufnahme, Stapelgrenzen,
Auffüllen bestehender Stapel vor neuen, Konsolidierung, Transfer mit Restmeldung,
Sortierung, unbekannte Item-IDs werden ignoriert statt zu werfen.

`lootRoller.test.ts`: Determinismus, gültige Item-IDs, Mengengrenzen,
Leer-Ergebnisse kommen vor (aber unter 25 %), Wertabstand Echo-Depot ↔ Kiste,
keine Duplikat-Einträge.

## Offen / nächster Schritt

- **M4**: Durchsuchungszeit abhängig von Behältertyp und Fertigkeiten, Schlüssel
  für verschlossene Hochwert-Räume
- **M5**: Sicherer Container (überlebt den Tod), Versicherung, Quest-Items
- Das Datenmodell bleibt bewusst grid-fähig erweiterbar, falls ein Tablet-Layout
  es je rechtfertigt
