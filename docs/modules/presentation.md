# Module: render, ui, platform, app

> Schichten 3–6 · Status 🟢 Prototyp fertig

## Grundregel

`render` und `ui` **lesen** die Simulation. Sie schreiben nie hinein.
Änderungen laufen ausschließlich über Intents: `ui → app → game`.

## platform — I/O hinter Interfaces

| Modul | Interface | Adapter im Prototyp |
|-------|-----------|---------------------|
| `input` | `InputSource → InputState` | `TouchInput`, `KeyboardMouseInput`, `CompositeInput` |
| `storage` | `StorageAdapter` | `LocalStorageAdapter`, `MemoryStorageAdapter` |
| `audio` | `AudioService` | `NullAudio` (echtes Audio in M7) |

`AudioService` ist vollständig verdrahtet, spielt aber nichts. Wenn in M7 echter
Ton kommt, ist das **ein neuer Adapter** — keine Suche durch die Codebasis nach
den richtigen Stellen.

### Twin-Stick auf Touch

Beide Sticks haben einen **dynamischen Ursprung**: Der Stick erscheint dort, wo
der Daumen aufsetzt, statt an einer festen Stelle, die man erst suchen muss.
Linke Bildhälfte bewegt, rechte zielt und feuert. Die Rolle folgt dem Finger,
der die Geste begonnen hat — ein über die Mitte gleitender Daumen wechselt also
nie mitten im Zug die Funktion.

Auslenkung des rechten Sticks über 25 % feuert automatisch. Ein separater
Feuerknopf würde einen Finger kosten, den niemand frei hat.

Elemente mit `data-ui-control` werden vom Touch-Layer ignoriert — ein Druck auf
einen HUD-Knopf erzeugt darunter also keinen virtuellen Stick.

## render — PixiJS

Ebenenreihenfolge:

```
1. floor      statische Graphics, einmal pro Raid gebaut
2. ground     Zonenringe und Anomaliefelder
3. entities   Wände, Props, Aktoren, Loot — jeden Frame tiefensortiert
4. vfx        Mündungsfeuer, Einschläge, Schadenszahlen
5. darkness   radiale Maske, folgt dem Spieler
```

**Boden als eine einzige Graphics**: Retained-Mode-Geometrie kostet unabhängig
von der Kartengröße nur wenige Draw Calls — deutlich günstiger als tausende
Boden-Sprites.

**Wände als gepoolte Sprites**, auf den sichtbaren Bereich gecullt und um
vollständig eingeschlossene Zellen bereinigt. Wandkacheln sind extrudiert
(beleuchtete Oberseite, zwei abgedunkelte Flanken) — ohne diesen vertikalen
Hinweis ist eine isometrische Wand nicht von andersfarbigem Boden zu unterscheiden.

**Interpolation**: Die Simulation läuft mit 60 Hz, das Rendering so schnell wie
möglich. Positionen werden zwischen `prev` und `current` interpoliert (ADR-004).

### Zwei Fallen, die hier bereits zugeschnappt sind

1. `worldToScreen` gab ursprünglich ein geteiltes Scratch-Objekt zurück. Beim
   Projizieren der vier Eckpunkte einer Bodenkachel zeigten damit alle vier
   Referenzen auf denselben Wert — jede Kachel wurde zum Polygon mit Fläche
   null, der Boden war unsichtbar. Die Funktion alloziert jetzt standardmäßig;
   Hot-Loops übergeben ihr eigenes Ziel.
2. Der Wand-Sprite-Pool las den Index aus einem erst am Frame-Ende
   aktualisierten Zähler — alle Wände eines Frames landeten im selben Slot.

Beide Bugs waren nur im Browser sichtbar, nicht in Unit-Tests. Deshalb existiert
`npm run smoke`.

## ui — DOM-Overlay (ADR-007)

Kein Framework. Ein ~60-Zeilen-Helfer (`components/dom.ts`) reicht für
deklarative Elementerzeugung, ohne Bundle-Kosten.

**Dirty-Flags statt Neuaufbau**: Das HUD merkt sich die zuletzt gezeigten Werte
und fasst das DOM nur an, wenn sich wirklich etwas geändert hat. Das hält den
Overlay im 1,5-ms-Budget.

Die Minimap rastert das statische Terrain einmal in ein Offscreen-Canvas; pro
Frame werden nur Spieler und Zonen neu gezeichnet. Sie zeigt **bewusst keine
Gegner** — vollständige Information würde genau die Spannung auflösen, um die es geht.

Alle Farben, Abstände und Radien kommen aus Design-Tokens (`ui/styles/tokens.css`).
Ein kompletter Re-Skin ist eine Änderung dieser einen Datei plus Asset-Manifest.

`ui/viewModel.ts` übersetzt den ECS-Zustand in ein flaches Snapshot-Objekt.
Damit läuft kein Screen jemals über die ECS-Stores — eine Änderung am
Komponentenlayout kann keinen Bildschirm zerbrechen.

## app — Komposition

`app/game.ts` ist die einzige Datei, die alle Schichten kennen darf. Sie enthält
keine Spielregeln, kein Zeichnen und keine Eingabedekodierung — nur Verdrahtung.

`app/gameStateMachine.ts` deklariert jeden erlaubten Übergang:

```
boot → menu → base → loadout → briefing → raid → result → base
```

Ein unerlaubter Übergang ist ein geloggter Fehler statt eines halb abgebauten
Bildschirms. Zustände räumen über `exit` selbst auf — deshalb kann ein zweimal
betretener Raid keine Simulation lecken.

### Lebenszyklus auf dem Gerät

- `visibilitychange` → speichern, Audio anhalten, laufenden Raid pausieren
- `pagehide` → speichern
- Overlays (Inventar, Pause) frieren die Simulation ein. Es ist ein
  Solo-PvE-Spiel (ADR-006) — niemanden bestrafen, dessen Telefon klingelt.

## Assets

Im Code stehen ausschließlich logische Keys (`actor.player`, `icon.item.medkit`).
Pfade existieren nur in `public/assets/manifest.json`. Fehlt ein Eintrag, erzeugt
die `PlaceholderFactory` aus dem Key-Präfix eine passende prozedurale Grafik in
der offiziellen Palette.

Deshalb sieht der Prototyp **stimmig** aus, obwohl noch keine einzige
Bilddatei existiert — und der Wechsel Canva → Figma → final ist ein reiner
Dateitausch.

## Offen / nächster Schritt

- **M4**: echter Licht-Pass über eine RenderTexture (Taschenlampenkegel,
  Mündungsblitz als echte Lichtquelle) statt der aktuellen radialen Maske
- **M6**: Capacitor-Integration, Texture-Atlanten, Haptik, Safe-Area-Feinschliff
- **M7**: WebAudio-Adapter, finale Assets, Lokalisierung
