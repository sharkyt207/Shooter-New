# PROJECT ECHO — Ordnerstruktur

> Dokument-Status: **verbindlich** · Version 1.0

Die Ordnerstruktur ist die physische Form des Schichtenmodells aus `01-ARCHITECTURE.md`.
Ein Ordner = eine Verantwortung. Wer eine Datei nicht eindeutig zuordnen kann, hat ein Designproblem.

```
Shooter-New/
├── docs/                          # Gesamte Projektdokumentation
│   ├── 00-VISION.md
│   ├── 01-ARCHITECTURE.md
│   ├── 02-ROADMAP.md
│   ├── 03-PROJECT-STRUCTURE.md
│   ├── 04-MODULES.md
│   ├── 05-TECH-DECISIONS.md       # ADRs (Architecture Decision Records)
│   ├── 06-ART-DIRECTION.md
│   ├── 07-ASSET-PIPELINE.md
│   ├── 08-UI-UX.md
│   ├── 09-PROTOTYPE-PLAN.md
│   └── modules/                   # Eine Doku pro fertiggestelltem Modul
│
├── public/
│   └── assets/                    # Laufzeit-Assets, NICHT gebündelt
│       ├── manifest.json          # Logischer Key → Datei. Einziger Ort mit Dateipfaden.
│       ├── ui/                    # Canva-Exporte: Panels, Buttons, Rahmen
│       ├── icons/                 # Item- und Fähigkeits-Icons
│       ├── sprites/               # Charaktere, Props, Tiles
│       └── audio/                 # Sounds (ab M7)
│
├── scripts/
│   ├── check-boundaries.mjs       # Erzwingt Architekturregeln im CI/Precommit
│   └── smoke-browser.mjs          # End-to-End-Test im echten Browser
│
├── src/
│   │
│   ├── core/                      # ── SCHICHT 0: Fundament, keine Spiel-Logik ──
│   │   ├── ecs/
│   │   │   ├── entity.ts          # EntityId, Freelist-Allokator
│   │   │   ├── componentStore.ts  # Typisierter Component-Speicher
│   │   │   └── world.ts           # World: Entities + Stores + Lebenszyklus
│   │   ├── math/
│   │   │   ├── vec2.ts            # Allokationsarme 2D-Vektoren
│   │   │   ├── random.ts          # SeededRandom (mulberry32) + Streams
│   │   │   ├── shapes.ts          # Kreis/AABB/Ray, Kollisionstests
│   │   │   └── scalar.ts          # clamp, lerp, approach, angleDelta
│   │   ├── events/eventBus.ts     # Typisierter, synchroner Bus
│   │   ├── time/fixedClock.ts     # Fester Zeitschritt + Interpolations-Alpha
│   │   └── util/                  # logger, objectPool
│   │
│   ├── content/                   # ── DATEN, kein Verhalten ──
│   │   ├── types.ts               # Schema aller Content-Definitionen
│   │   ├── items.ts               # Item-Definitionen (+ ItemId-Typ)
│   │   ├── weapons.ts             # Waffen-Definitionen (+ WeaponId-Typ)
│   │   ├── enemies.ts             # Gegner-Archetypen
│   │   ├── lootTables.ts          # Gewichtete Loot-Tabellen
│   │   ├── attachments.ts         # Waffenaufsätze mit Stat-Deltas
│   │   ├── throwables.ts          # Wurfgeschosse
│   │   ├── biomes.ts              # Fragment-Typen + Container-Definitionen
│   │   ├── baseModules.ts         # Basisgebäude, Ausbaustufen, Crafting-Rezepte
│   │   └── balance.ts             # ALLE Balance-Konstanten an einem Ort
│   │
│   ├── game/                      # ── DIE SIMULATION (pure TS, kein DOM/Pixi) ──
│   │   ├── components.ts          # Alle Component-Typen der Simulation
│   │   ├── gameEvents.ts          # Event-Vertrag Sim → Präsentation
│   │   ├── simulation/
│   │   │   ├── raidSimulation.ts  # Orchestriert Systeme + Weltzustand
│   │   │   ├── raidWorld.ts       # ECS-Welt mit allen Component-Stores
│   │   │   ├── simContext.ts      # Kontextobjekt für alle Systeme
│   │   │   ├── collision.ts       # Kreis-gegen-Gitter-Bewegung
│   │   │   ├── factories.ts       # Bauplan je Entity-Art
│   │   │   └── systems/           # Ein System = eine Datei = eine Aufgabe
│   │   ├── player/                # Spieler-Erstellung, Zustand, Intents
│   │   ├── combat/                # Ballistik, Schaden, Wurfgeschosse, Nahkampf
│   │   ├── weapons/               # Feuerlogik, Stat-Auflösung, Verschleiß
│   │   ├── inventory/             # Container, Gewicht, Ausrüsten
│   │   ├── loot/                  # Loot-Erzeugung und Aufnahme
│   │   ├── enemies/               # Spawning, Archetypen-Instanziierung
│   │   ├── ai/                    # Wahrnehmung, FSM, Steering
│   │   ├── extraction/            # Zonen, Verfügbarkeit, Halte-Timer
│   │   ├── map/                   # Fragment-Generator, Kollisionsgitter
│   │   ├── base/                  # Basiszustand, Ausbau, Werkstatt
│   │   ├── economy/               # Währung, Händler, Preise
│   │   ├── crafting/              # Rezeptausführung
│   │   └── save/                  # Save-Schema, Migrationen, Serialisierung
│   │
│   ├── platform/                  # ── I/O hinter Interfaces ──
│   │   ├── input/                 # InputSource-Interface, Touch- & Keyboard-Adapter
│   │   ├── storage/               # StorageAdapter-Interface, LocalStorage-Adapter
│   │   └── audio/                 # AudioService-Interface, WebAudio-Adapter
│   │
│   ├── render/                    # ── PRÄSENTATION: PixiJS ──
│   │   ├── assets/
│   │   │   ├── assetRegistry.ts   # Logischer Key → Textur (mit Platzhalter-Fallback)
│   │   │   └── placeholderFactory.ts # Prozedurale Platzhalter, solange Assets fehlen
│   │   ├── iso/isoProjection.ts   # Welt (Meter) → Bildschirm (Iso-Pixel)
│   │   ├── camera.ts              # Folgen, Vorausblick, Kamerawackeln
│   │   └── worldRenderer.ts       # Liest Sim, zeichnet Szene (Ebenen inline)
│   │
│   ├── ui/                        # ── DOM-Overlay ──
│   │   ├── uiRoot.ts              # Screen-Verwaltung, Lebenszyklus
│   │   ├── components/            # Wiederverwendbare Bausteine (Button, Panel, List)
│   │   ├── hud/                   # In-Raid-HUD, Minimap, Sticks
│   │   ├── screens/               # MainMenu, Base, Loadout, Workshop, Result, …
│   │   ├── styles/                # CSS, Design-Tokens
│   │   └── viewModel.ts           # Sim-Zustand → flaches UI-Snapshot
│   │
│   └── app/                       # ── KOMPOSITION: darf alles kennen ──
│       ├── main.ts                # Einstiegspunkt
│       ├── game.ts                # Verdrahtet Sim, Renderer, UI, Platform
│       └── gameStateMachine.ts    # Boot → Menu → Base → Loadout → Raid → Result
│
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts                 # Build + Vitest in einer Konfiguration
└── README.md
```

> Der Baum oben entspricht dem tatsächlichen Stand nach M1. Wächst ein Bereich
> (z. B. `render/layers/`, wenn der Licht-Pass in M4 dazukommt), wird dieses
> Dokument im selben Commit mitgezogen.

## Konventionen

| Thema | Regel |
|-------|-------|
| Dateinamen | `camelCase.ts` für Module, `PascalCase` nur für Klassen-Exporte |
| Tests | Co-lokiert als `<name>.test.ts` direkt neben der Quelldatei |
| Sprache | **Code, Bezeichner und Code-Kommentare auf Englisch.** Dokumentation auf Deutsch. |
| Imports | Nur über den Alias `@/…` (z. B. `@/core/math/vec2`), nie über `../../..` |
| Exporte | Named Exports. Kein `export default` (außer wo ein Tool es erzwingt). |
| Konstanten | Balance-Werte **immer** in `content/balance.ts`, nie inline im System |
| Assets | Im Code nur logische Keys. Dateipfade existieren ausschließlich in `manifest.json`. |
