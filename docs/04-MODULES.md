# PROJECT ECHO — Modulübersicht

> Dokument-Status: **verbindlich** · Version 1.0

Jedes Modul ist eigenständig erweiterbar. Module kommunizieren über **typisierte Verträge**
(Funktionen, Daten, Events) — niemals über gemeinsame veränderliche Globals.

Legende Reifegrad: 🟢 Prototyp fertig · 🟡 Grundgerüst · ⚪ geplant

---

## Schicht 0 — Core

| Modul | Zweck | Öffentlicher Vertrag | Status |
|-------|-------|----------------------|--------|
| `core/ecs` | Entities, Components, World-Lebenszyklus | `World`, `ComponentStore<T>`, `EntityId` | 🟢 |
| `core/math` | Vektoren, Kollisionsformen, Skalar-Helfer | `Vec2`, `circleVsAabb`, `clamp`, `lerp` | 🟢 |
| `core/math/random` | Deterministischer Zufall mit benannten Streams | `SeededRandom`, `RandomStreams` | 🟢 |
| `core/events` | Typisierter, synchroner Event-Bus | `EventBus<TMap>` | 🟢 |
| `core/time` | Fester Zeitschritt, Interpolations-Alpha | `FixedClock` | 🟢 |
| `core/util` | Logger, Objekt-Pool | `Logger`, `ObjectPool<T>` | 🟢 |

**Regel:** `core` enthält **keine** Spielbegriffe. Kein „Waffe", kein „Loot", kein „Raid".

---

## Schicht 1 — Content (Daten)

| Modul | Zweck | Status |
|-------|-------|--------|
| `content/types` | Schema aller Definitionen; IDs werden je Datei als String-Literal-Typ abgeleitet → Tippfehler sind Compile-Fehler | 🟢 |
| `content/items` | Items: Kategorie, Gewicht, Wert, Stack, Icon-Key | 🟢 |
| `content/weapons` | Waffen-Stats, Munitionstyp, Handling | 🟢 |
| `content/enemies` | Gegner-Archetypen: Stats, Wahrnehmung, Verhalten, Loot | 🟢 |
| `content/lootTables` | Gewichtete Tabellen pro Containertyp und Biom | 🟢 |
| `content/biomes` | Fragment-Typen der Echo-Welt (Labor, Wald, Station, …) | 🟢 |
| `content/baseModules` | Basisgebäude, Ausbaustufen, Kosten, Freischaltungen, Crafting-Rezepte | 🟡 |
| `content/balance` | **Alle** Balance-Konstanten zentral | 🟢 |

**Regel:** Content ist **rein deklarativ**. Keine Funktion, kein `if`, kein Import aus `game/`.

---

## Schicht 2 — Game (Simulation)

### `game/simulation` 🟢
Orchestriert einen Raid: hält `World`, `SeededRandom`, `EventBus`, Kollisionsgitter und die
Systemliste in fester Reihenfolge.

```ts
const sim = new RaidSimulation({ seed, loadout });
sim.start();
sim.applyIntent(intent);
sim.step();                // exakt ein fester Sim-Schritt
sim.snapshot();            // read-only View für Renderer/UI
```

### `game/player` 🟢
Spielererstellung aus Loadout, Health/Stamina, Intent-Verarbeitung, Tod.
**Vertrag:** `createPlayer(world, loadout, spawn)`, `PlayerIntent`.

### `game/weapons` 🟢
Feuerrate, Magazin, Nachladen, Streuung, Munitionsverbrauch.
Erzeugt Projektil-Anfragen — trifft keine Schadensentscheidung (Trennung von Feuern und Wirkung).

### `game/combat` 🟢
Projektilbewegung, Kollision, Schadensberechnung (Rüstung, Falloff), Tod und Aufräumen.

### `game/inventory` 🟢
Gewichts- und Slot-basiertes Container-System (bewusst **kein** Tetris-Grid, siehe ADR-005).
Ausrüsten, Stapeln, Wegwerfen, Verbrauchen, Überladungs-Malus.

### `game/loot` 🟢
Loot-Erzeugung aus gewichteten Tabellen, Bodenloot, Container-Zustände, Aufnahme-Reichweite.

### `game/enemies` 🟢
Spawn-Steuerung nach Biom und Raid-Fortschritt, Instanziierung von Archetypen.

### `game/ai` 🟢
Wahrnehmung (Sichtkegel + Sichtlinie + Gehör) und Verhaltens-FSM:

```
IDLE ──sieht/hört──► INVESTIGATE ──sieht──► CHASE ──in Reichweite──► ATTACK
  ▲                       │                    │                        │
  └───────verliert────────┴────────────────────┘                        │
                                    ▲                                   │
                              FLEE ◄┴──── Health < Schwelle ────────────┘
```

### `game/extraction` 🟢
Zonen mit Zustand `locked → available → closing → closed`, Halte-Timer,
Abbruch bei Verlassen der Zone oder bei Beschuss. Erfolgreiche Nutzung setzt `used`.

### `game/map` 🟢
Fragment-Komposition: mehrere Biom-Fragmente werden über Nahtzonen verbunden,
daraus entstehen Kollisionsgitter, Spawns, Loot-Punkte, Extraction-Zonen.

### `game/base` 🟡 · `game/economy` 🟡 · `game/crafting` 🟡
Meta-Progression zwischen den Raids. Im Prototyp als funktionsfähiges Grundgerüst,
Vertiefung in M5.

### `game/save` 🟢
Versionierte Serialisierung mit Migrationskette. Nur JSON-taugliche Daten.

---

## Schicht 3 — Platform

| Modul | Interface | Adapter |
|-------|-----------|---------|
| `platform/input` | `InputSource → InputState` | `TouchInput` (virtuelle Sticks), `KeyboardMouseInput` |
| `platform/storage` | `StorageAdapter` | `LocalStorageAdapter`, später `CapacitorPreferences` |
| `platform/audio` | `AudioService` | `NullAudio` (Prototyp), später `WebAudioService` |

**Regel:** Jedes Platform-Modul ist ein Interface + mindestens ein Adapter.
Der Rest des Spiels kennt nur das Interface.

---

## Schicht 4 — Render

| Modul | Zweck |
|-------|-------|
| `render/assets/assetRegistry` | Löst logische Keys über `manifest.json` auf, fällt sonst auf Platzhalter zurück |
| `render/assets/placeholderFactory` | Erzeugt prozedurale Platzhalter-Texturen (kein fehlendes Bild blockiert je die Entwicklung) |
| `render/iso/isoProjection` | Welt (Meter) ⇄ Bildschirm (Iso-Pixel), Tiefensortierung, Sicht-Culling |
| `render/camera` | Weiches Folgen, Vorausblick in Zielrichtung, Kamerawackeln |
| `render/worldRenderer` | Liest Sim, interpoliert, zeichnet — Ebenen (Boden, Ground, Entities, VFX, Darkness) als Container darin |

**Regel:** Renderer **liest** die Simulation. Er schreibt nie hinein.

---

## Schicht 5 — UI

| Modul | Zweck |
|-------|-------|
| `ui/uiRoot` | Screen-Stack, Ein-/Ausblenden, Lebenszyklus |
| `ui/hud/*` | Vitals, Munition, Minimap, Extraction-Banner, Touch-Sticks |
| `ui/screens/*` | MainMenu, Base, Loadout, Briefing, Result, Inventory, Pause |
| `ui/components/dom` | Deklarative Elementerzeugung, Balken, Formatierung |
| `ui/styles/*` | Design-Tokens (Farben, Abstände, Radien, Schrift) |
| `ui/viewModel` | Übersetzt ECS-Zustand in ein flaches UI-Snapshot-Objekt |

**Regel:** UI sendet **Intents**, nie direkte Mutationen. `ui → app → game`.

---

## Schicht 6 — App

| Modul | Zweck |
|-------|-------|
| `app/game` | Verdrahtung aller Schichten (Composition Root) |
| `app/gameStateMachine` | `Boot → MainMenu → Base → Loadout → Raid → RaidResult` |
| `app/main` | Einstiegspunkt, Fehlerbehandlung, Lifecycle-Hooks |

---

## Erweiterungs-Beispiele (wie modular sich das anfühlt)

| Wunsch | Nötige Änderung |
|--------|-----------------|
| Neue Waffe | 1 Eintrag in `content/weapons.ts` + 1 Zeile im Asset-Manifest |
| Neuer Gegnertyp | 1 Eintrag in `content/enemies.ts` (+ optional neuer AI-Zustand) |
| Neues Biom | 1 Eintrag in `content/biomes.ts` |
| Neues Basisgebäude | 1 Eintrag in `content/baseModules.ts` |
| Canva-Assets ersetzen | Nur `public/assets/manifest.json` + Dateien — **null Code** |
| Renderer tauschen | Nur `render/**` neu schreiben. `game/**` bleibt unberührt. |
