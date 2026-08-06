# Modul: game/map

> Schicht 2 · Status 🟢 Prototyp fertig

## Zweck

Erzeugt aus einem Seed eine vollständige, garantiert spielbare Raid-Karte:
Kollisionsgitter, Spawn, Behälter, Gegner, Anomalien und Extraktionszonen.

Dies ist die mechanische Umsetzung des Settings: Ein Echo-Riss näht Fragmente
verschiedener Welten aneinander, deshalb ist kein Raid gleich (Pillar P2).

## Öffentlicher Vertrag

```ts
const map = generateMap(rng.map, { fragmentCount: 3 });
// -> { grid, fragments, playerSpawn, containers, enemies, anomalies, extractions, biomeNames }
```

`MapGrid` ist die Kollisionswelt:

```ts
grid.isWallAtWorld(x, y): boolean
grid.hasLineOfSight(x0, y0, x1, y1): boolean   // DDA-Gitterlauf
grid.floodFill(startIndex): Uint8Array
grid.cellBounds(cx, cy, out): Aabb
```

## Pipeline

```
1. Fragmente auf einem groben Gitter platzieren (Rechts/Runter-Lauf → gerade oder L-Form)
2. Je Fragment: Innenfläche öffnen, dann Wandblöcke nach Biom-Dichte streuen
3. Nahtkorridore zwischen aufeinanderfolgenden Fragmenten schneiden
4. Flood-Fill vom Startfragment: alles Unerreichbare wird zur Wand
5. Bevölkern: Spawn, Extraktionszonen, Behälter, Gegner, Anomalien
```

**Schritt 4 ist nicht optional.** Eine unerreichbare Extraktionszone oder ein
unerreichbarer Hochwert-Behälter ruiniert einen Raid lautlos. Der Test
`mapGenerator.test.ts` prüft über sechs Seeds, dass *keine* offene Zelle
unerreichbar ist.

## Datenmodell

| Zellwert | Bedeutung |
|----------|-----------|
| `CELL_OPEN` | begehbar, gehört zu einem Fragment |
| `CELL_WALL` | blockiert Bewegung, Projektile und Sicht |
| `CELL_SEAM` | begehbarer Nahtkorridor zwischen zwei Fragmenten |

Zusätzlich speichert `fragmentOf` je Zelle den Fragment-Index — daraus leiten
Renderer und Spawner Biom-Optik und Bewohner ab.

## Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| Wandblöcke statt Einzelzell-Rauschen | Blöcke lesen sich isometrisch deutlich besser und geben der KI etwas, hinter dem sie die Sichtlinie verlieren kann |
| Rechteckige Fragmente mit Nahtkorridoren | Direkte Umsetzung der Fiktion, und die Naht ist ein natürlicher Spannungsort |
| Loot wird **nicht** bei der Generierung gewürfelt | Ein Behälter würfelt erst beim Öffnen (`interactionSystem`) — der Raid zahlt nur für Loot, den der Spieler wirklich erreicht |
| Extraktionszonen: je weiter vom Spawn, desto später | Das ist die Risikomechanik in einer Zeile Code |
| Mindestabstand 14 m Gegner ↔ Spawn | Ein Tod in Sekunde 2 ist kein Spannungsbogen |

## Tests

`game/map/mapGenerator.test.ts` — Determinismus, Fragmentanzahl, **vollständige
Erreichbarkeit**, Spawn auf offener Zelle, geschlossener Kartenrand,
gestaffelte Öffnungszeiten, Sichtlinie durch Freiraum und Blockade durch Wände,
Terminierung bei entarteten Strahlen.

## Offen / nächster Schritt (M4)

- Handgebaute Raum-Prefabs, prozedural verkettet (Hybrid statt rein prozedural)
- Türen, Schlösser, Schlüsselkarten, verschlossene Hochwert-Räume
- Alle fünf Anomalietypen statt nur `Stillstand`
- Wetter und Tageszeit mit Sicht- und Audiowirkung
