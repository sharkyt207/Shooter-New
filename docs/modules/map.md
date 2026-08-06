# Modul: game/map

> Schicht 2 · Status 🟢 M4 abgeschlossen

## Zweck

Erzeugt aus einem Seed eine vollständige, garantiert spielbare Raid-Karte:
Kollisionsgitter, Spawn, Räume, Türen, Behälter, Gegner, Anomalien, Wetter und
Extraktionszonen.

Dies ist die mechanische Umsetzung des Settings: Ein Echo-Riss näht Fragmente
verschiedener Welten aneinander, deshalb ist kein Raid gleich (Pillar P2).

## Öffentlicher Vertrag

```ts
const map = generateMap(rng.map, { fragmentCount: 3 });
// -> {
//      grid, fragments, playerSpawn,
//      containers, enemies, anomalies, extractions,
//      doors, coverPoints, prefabs, weather, biomeNames
//    }
```

`MapGrid` ist die Kollisionswelt:

```ts
grid.isWall(cx, cy): boolean        // reine Geometrie (Renderer)
grid.isBlocking(cx, cy): boolean    // Wand ODER geschlossene Tür (Gameplay)
grid.isNavBlocked(cx, cy): boolean  // Wand ODER *verschlossene* Tür (Pathfinding)
grid.isWallAtWorld(x, y): boolean
grid.hasLineOfSight(x0, y0, x1, y1): boolean   // DDA-Gitterlauf
grid.floodFill(startIndex): Uint8Array
grid.cellBounds(cx, cy, out): Aabb
grid.setDoorState(cx, cy, DOOR_OPEN): void     // erhöht grid.version
```

## Pipeline

```
1. Fragmente auf einem groben Gitter platzieren (Rechts/Runter-Lauf → gerade oder L-Form)
2. Je Fragment: Innenfläche öffnen, dann Wandblöcke nach Biom-Dichte streuen
3. Handgebaute Raum-Prefabs einstempeln, Anker einsammeln
4. Nahtkorridore zwischen aufeinanderfolgenden Fragmenten schneiden
5. Flood-Fill vom Startfragment: alles Unerreichbare wird zur Wand
6. Bevölkern: Spawn, Extraktionszonen, Behälter, Gegner, Anomalien, Schlüssel
7. Wetter würfeln
```

**Schritt 5 ist nicht optional.** Eine unerreichbare Extraktionszone oder ein
unerreichbarer Hochwert-Behälter ruiniert einen Raid lautlos. Der Test
`mapGenerator.test.ts` prüft über sechs Seeds, dass *keine* offene Zelle
unerreichbar ist.

## Raum-Prefabs (M4)

ADR-011 versprach einen Hybrid: prozedurale Komposition **handgebauter**
Teile. M1 lieferte nur die prozedurale Hälfte, und das war zu sehen —
gestreute Wandblöcke erzeugen *Raum*, aber niemals einen *Ort*. An ein
zufälliges Rechteck erinnert sich niemand.

Ein Prefab (`content/prefabs.ts`) ist ein Zeichenraster, das mitsamt seiner
Türen, Loot-Anker, Deckungs- und Gegnerposten eingestempelt wird — ein Raum
kommt damit als fertige Idee an und nicht als Geometrie, über die der Spawner
raten muss.

| Zeichen | Bedeutung |
|---------|-----------|
| `#` | Wand |
| `.` | Boden |
| `D` | Tür, geschlossen |
| `+` | Tür, verschlossen — braucht den Schlüssel des Raums |
| `L` | Loot-Anker (Behälter bevorzugt hier) |
| `V` | Tresor-Loot, nur in Vault-Räumen |
| `C` | Deckungsposten für die KI |
| `E` | Gegnerposten |
| `A` | Anomalie-Anker |

Vor dem Stempeln wird der Rand (`MAP.prefabMargin`) rings um das Prefab auf
Boden gesetzt. Das ist keine Kosmetik: Es garantiert, dass jede Tür auf
begehbaren Boden führt — sonst versiegelt der Erreichbarkeitspass in Schritt 5
den Raum wieder, und mit ihm oft das halbe Fragment.

> **Erfahrung aus der Umsetzung.** Genau das ist passiert: Die erste Fassung
> von `pf_double_chamber` setzte ihre Außentür direkt unter die
> Trennwand. Der Raum sah in der Layout-Zeichenkette völlig korrekt aus,
> stempelte korrekt — und ließ den Flood-Fill anschließend das gesamte Fragment
> löschen. Deshalb prüft `validatePrefabs()` jetzt zusätzlich, dass jede Tür ins
> Rauminnere öffnet und **jede** begehbare Zelle von einer Tür aus erreichbar
> ist. Diese Klasse von Fehler ist in einer Zeichenkette unsichtbar und in einem
> Validator trivial.

## Türen und Schlüssel

Türen sind zwei Dinge gleichzeitig: ein Stück Kollision, das dem Gitter gehört,
und eine Entity, die weiß, *warum* sie zu ist. Weil das Gitter die Autorität
ist, sind sich Kollision, Sichtlinie, Projektile und Flow-Field ohne einen
einzigen Sonderfall einig.

- Türen öffnen **auf Annäherung**, nicht auf Knopfdruck. Ein zusätzliches Verb,
  das der Spieler mitten im Gefecht suchen muss, ist auf einem Touchgerät ein
  Designfehler (Pillar P4) — und eine automatische Tür beseitigt die gesamte
  Fehlerklasse „Gegner mahlt gegen den Türrahmen“.
- Eine verschlossene Tür öffnet ausschließlich für einen Spieler mit dem
  passenden Schlüssel. Gegner tragen nie Schlüssel, also bleibt ein Vault ein
  Raum, den nur der Spieler betreten kann.
- Der Schlüssel liegt garantiert als `guaranteed`-Inhalt in einem Behälter
  **außerhalb** des Raums, den er öffnet — ein Schlüssel, der von einem
  Loot-Wurf abhängt, ist ein Vault, das sich manchmal nicht öffnen lässt.
- Jede Tür macht Geräusch. Eine aufgebrochene mehr.

## Wetter

Ein Regler, der dieselbe Karte in einen anderen Raid verwandelt: Sichtweite,
Hörweite, Umgebungslicht, Tönung, Partikeldichte (`content/weather.ts`).

Die Designregel lautet: **Wetter ist nie einseitig schlecht.** Nebel verbirgt
den Spieler genauso gut wie den Gegner, ein Sturm schluckt beider Schritte.
Was sich ändert, ist *welche* Herangehensweise der Raid belohnt.

## Datenmodell

| Zellwert | Bedeutung |
|----------|-----------|
| `CELL_OPEN` | begehbar, gehört zu einem Fragment |
| `CELL_WALL` | blockiert Bewegung, Projektile und Sicht |
| `CELL_SEAM` | begehbarer Nahtkorridor zwischen zwei Fragmenten |
| `CELL_DOOR` | Türöffnung; ob sie blockiert, sagt `doorOf` |

| `doorOf` | Bedeutung |
|----------|-----------|
| `DOOR_NONE` | keine Tür |
| `DOOR_OPEN` | offen — blockiert nichts mehr |
| `DOOR_CLOSED` | zu; blockiert Bewegung/Sicht, aber **nicht** die Wegfindung |
| `DOOR_LOCKED` | verschlossen; blockiert auch die Wegfindung |

Zusätzlich speichert `fragmentOf` je Zelle den Fragment-Index — daraus leiten
Renderer und Spawner Biom-Optik und Bewohner ab. `grid.version` steigt bei jeder
Topologieänderung; der `NavigationCache` verwirft daraufhin veraltete Felder.

## Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| Wandblöcke statt Einzelzell-Rauschen | Blöcke lesen sich isometrisch deutlich besser und geben der KI etwas, hinter dem sie die Sichtlinie verlieren kann |
| Rechteckige Fragmente mit Nahtkorridoren | Direkte Umsetzung der Fiktion, und die Naht ist ein natürlicher Spannungsort |
| Loot wird **nicht** bei der Generierung gewürfelt | Ein Behälter würfelt erst beim Öffnen (`interactionSystem`) — der Raid zahlt nur für Loot, den der Spieler wirklich erreicht |
| Extraktionszonen: je weiter vom Spawn, desto später | Das ist die Risikomechanik in einer Zeile Code |
| Mindestabstand 14 m Gegner ↔ Spawn | Ein Tod in Sekunde 2 ist kein Spannungsbogen |
| Türzustand liegt im **Gitter**, nicht in der Komponente | Kollision, Sicht, Projektile und Flow-Field fragen dieselbe Quelle — kein Sonderfall, keine Divergenz |
| Türen öffnen automatisch statt per Knopf | Ein Extra-Verb im Gefecht ist auf Touch ein Designfehler; nebenbei entfällt „KI steckt am Türrahmen fest“ |
| Verschlossene Türen blockieren die Wegfindung, geschlossene nicht | Wer keine Schlüssel tragen kann, soll auch nicht dorthin geroutet werden |
| Flood-Fill läuft **durch** verschlossene Türen | Sonst versiegelt der Erreichbarkeitspass genau die Kammer, die er schützen soll |
| Schlüssel als garantierter Behälterinhalt, nicht als Loot-Tabelleneintrag | Ein gewürfelter Schlüssel ist ein Vault, das manchmal unlösbar ist |
| Anker (Loot/Gegner) werden **vor** dem Zufallsstreuen verbraucht | Das Gegner- und Behälterbudget bleibt gleich, landet aber in Räumen, die man wiedererkennt |

## Tests

- `game/map/mapGenerator.test.ts` — Determinismus, Fragmentanzahl, **vollständige
  Erreichbarkeit**, Spawn auf offener Zelle, geschlossener Kartenrand,
  gestaffelte Öffnungszeiten, Sichtlinie durch Freiraum und Blockade durch
  Wände, Terminierung bei entarteten Strahlen.
- `game/map/worldGeneration.test.ts` (M4) — jede Seed liefert eine begehbare
  Karte mit Prefabs und Deckungspunkten, kein Behälter steht in einer Tür, jede
  Tür führt irgendwohin, jede verschlossene Tür hat einen Schlüssel außerhalb
  ihres Raums, und Prefabs wie Wetter sind reproduzierbar.
- `content/prefabs.test.ts` — alle Prefabs valide; der Validator erkennt eine
  Tür in einer Wand und eine abgeschnittene Kammer.
- `game/simulation/doors.test.ts` — geschlossene Tür blockiert Bewegung, Sicht
  und Projektile, aber nicht die Wegfindung; verschlossene blockiert auch die
  Wegfindung; Öffnen verwirft zwischengespeicherte Flow-Fields.

## Offen / nächster Schritt

- Zerstörbare Deckung und Türen, die sich wieder schließen lassen (M7)
- Vertikalität (Rampen, zweite Ebene) — bewusst zurückgestellt, siehe ADR-012
