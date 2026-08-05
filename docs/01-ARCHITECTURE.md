# PROJECT ECHO — Technische Architektur

> Dokument-Status: **verbindlich** · Version 1.0 · Owner: Senior Gameplay Programmer

---

## 1. Leitprinzip: Die Simulation kennt kein Bild

Die wichtigste Architekturregel des gesamten Projekts:

> **`src/game/**` (die Simulation) darf NIEMALS `pixi.js`, das DOM, `window`, `document`
> oder irgendetwas aus `src/render/**` bzw. `src/ui/**` importieren.**

Daraus folgt alles Weitere:

- Die Simulation ist **deterministisch** und **headless testbar** (Vitest, keine Browser-Umgebung nötig).
- Der Renderer ist **austauschbar**. PixiJS heute, potenziell etwas anderes morgen — ohne Gameplay-Rewrite.
- Save-Games sind reine Datenstrukturen, keine Objektgraphen.
- Multiplayer ist später möglich, weil eine deterministische Sim serverseitig laufen kann.

Diese Regel wird **maschinell erzwungen**: `npm run check:boundaries` bricht den Build,
wenn eine verbotene Abhängigkeit entsteht.

---

## 2. Schichtenmodell

```
┌───────────────────────────────────────────────────────────────────────┐
│  app/            Bootstrap · Dependency-Wiring · GameStateMachine      │
│                  (die einzige Schicht, die alles kennen darf)         │
└───────────────┬───────────────────────────┬───────────────────────────┘
                │                           │
        ┌───────▼────────┐          ┌───────▼────────┐
        │  render/       │          │  ui/           │
        │  PixiJS Szene  │          │  DOM Overlay   │
        │  Iso-Projektion│          │  HUD + Screens │
        │  Licht, VFX    │          │                │
        └───────┬────────┘          └───────┬────────┘
                │   liest (read-only)       │   liest + sendet Intents
                └─────────────┬─────────────┘
                              │
        ┌─────────────────────▼─────────────────────┐
        │  game/    DIE SIMULATION (pure TypeScript) │
        │  player · combat · weapons · inventory     │
        │  loot · enemies · ai · extraction          │
        │  economy · crafting · base · save · map    │
        └─────────────────────┬─────────────────────┘
                              │
        ┌─────────────────────▼─────────────────────┐
        │  core/    ECS · Math · RNG · Events · Time │
        │           (keine Spiel-Logik, keine I/O)   │
        └───────────────────────────────────────────┘

        ┌───────────────────────────────────────────┐
        │  content/  Reine Daten: Items, Waffen,     │
        │            Gegner, Loot-Tabellen, Rezepte  │
        └───────────────────────────────────────────┘

        ┌───────────────────────────────────────────┐
        │  platform/ Input · Storage · Audio · Device│
        │            (Interfaces + Web-Adapter)      │
        └───────────────────────────────────────────┘
```

### Erlaubte Import-Richtungen

| Von ↓ / Nach → | core | content | game | platform | render | ui | app |
|---|---|---|---|---|---|---|---|
| **core**     | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **content**  | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **game**     | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **platform** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **render**   | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **ui**       | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **app**      | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> `render` und `ui` dürfen `game` **lesen**, aber niemals dessen Zustand direkt mutieren.
> Änderungen laufen ausschließlich über **Commands/Intents** (siehe Abschnitt 5).

---

## 3. Technologie-Stack

| Bereich | Wahl | Begründung (Kurzform, Details in `05-TECH-DECISIONS.md`) |
|---------|------|-----------------------------------------------------------|
| Sprache | **TypeScript (strict)** | Typsicherheit über Modulgrenzen, refactor-fest bei wachsender Codebasis |
| Build | **Vite 7** | Sofortiger HMR, minimale Konfiguration, optimierte Produktionsbundles |
| Renderer | **PixiJS v8** (WebGL2/WebGPU) | Bestes 2D-Performance/Aufwand-Verhältnis auf Mobile, Shader-fähig für Licht |
| UI | **DOM + CSS** (Overlay) | Gestochen scharfe Schrift, natives Scrolling/Touch, Canva-Assets als `<img>` direkt austauschbar |
| Tests | **Vitest** | Gleiche Toolchain wie Vite, schnelle headless Sim-Tests |
| Mobile-Shell | **Capacitor** (ab M6) | Nativer iOS-/Android-Wrapper, App-Store-fähig, ohne Gameplay-Rewrite |
| Persistenz | **Storage-Interface** + LocalStorage-Adapter | Adapter später gegen Capacitor Preferences / SQLite tauschbar |
| Audio | **WebAudio** hinter Interface | Später gegen native Engine austauschbar |

**Bewusst NICHT genutzt:** kein React/Vue (UI ist klein und performance-kritisch), keine Physik-Engine
(unsere Kollision ist Kreis/AABB und muss deterministisch bleiben), kein State-Management-Framework.

---

## 4. Kern-Bausteine

### 4.1 ECS (Entity–Component–System), pragmatisch

Kein Framework, ~200 Zeilen eigener Code in `core/ecs`.

```ts
const world = new World();
const e = world.createEntity();
world.transforms.set(e, { x: 0, y: 0, rotation: 0 });
world.health.set(e, { current: 100, max: 100 });
```

- **Entities** sind `number`-IDs (recycelt über eine Freelist).
- **Components** sind Plain Objects in typisierten `ComponentStore<T>` (Map-basiert).
- **Systems** sind reine Funktionen `(world, dt, ctx) => void`, in fester, dokumentierter Reihenfolge.

Begründung: volle Kontrolle, keine Blackbox, trivial serialisierbar, ausreichend performant
für ~300 Entities pro Raid (unser realistisches Ziel).

### 4.2 Fester Zeitschritt

```
Sim-Rate:    60 Hz fest (16.6667 ms)  → deterministisch, framerate-unabhängig
Render-Rate: so schnell wie möglich, mit Interpolation (alpha) zwischen zwei Sim-Ticks
Max Catch-up: 5 Ticks pro Frame (verhindert Death-Spiral bei Lag/Tab-Wechsel)
```

### 4.3 Determinismus & Zufall

- **Kein `Math.random()` in `game/**`.** Verstoß = Build-Fehler (Boundary-Check).
- Zentraler `SeededRandom` (mulberry32) mit benannten Streams:
  `map`, `loot`, `ai`, `combat` — damit Änderungen in einem Subsystem nicht die Weltgenerierung verschieben.
- Ein Raid ist vollständig durch `{ seed, loadout, playerActions }` reproduzierbar → Bug-Reports werden reproduzierbar.

### 4.4 Event-Bus

Typisierter, synchroner Bus (`core/events`). Simulation **emittiert**, Präsentation **hört zu**.

```ts
bus.emit('damage:dealt', { target, amount, position, isCritical });
bus.emit('loot:pickedUp', { itemId, quantity });
bus.emit('extraction:available', { zoneId, closesAtTick });
```

So bleibt die Sim frei von Sound- und VFX-Aufrufen — Feedback wird ausschließlich in `render`/`ui` erzeugt.

---

## 5. Datenfluss pro Frame

```
 1. platform/input   →  liest Touch/Keyboard  →  InputState { moveAxis, aimAxis, buttons }
 2. app              →  wandelt InputState in PlayerIntent (Commands)
 3. game/simulation  →  fixed step: systems in fester Reihenfolge, konsumiert Intents
 4. game             →  emittiert Events auf dem Bus
 5. render           →  liest World (read-only), interpoliert, zeichnet
 6. ui               →  liest View-Model-Snapshot, aktualisiert nur bei Änderung (Dirty-Flags)
```

**Systemreihenfolge im Raid-Tick (verbindlich):**

```
InputIntent → PlayerMovement → EnemyPerception → EnemyAI → EnemyMovement
→ WeaponFire → ProjectileMovement → CollisionResolve → DamageApply → DeathCleanup
→ LootProximity → AnomalyEffects → ExtractionZones → RaidTimer → EventFlush
```

Diese Reihenfolge ist Teil des Determinismus-Vertrags und darf nur bewusst und dokumentiert geändert werden.

---

## 6. Content-Daten statt Code

Alle Spielinhalte liegen in `src/content/**` als typisierte Daten-Objekte, **nicht** als Klassen:

```ts
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  'wpn_splitter': {
    id: 'wpn_splitter', name: 'Splitter VK-2', tier: 2,
    damage: 18, fireRateRpm: 540, magazineSize: 24,
    spreadDeg: 3.2, reloadSeconds: 2.1, ammoType: 'ammo_9mm',
    visual: 'weapon.splitter',   // ← nur ein LOGISCHER Asset-Key
  },
};
```

Der `visual`-Key ist **niemals ein Dateipfad**. Die Auflösung übernimmt die `AssetRegistry`
(siehe `07-ASSET-PIPELINE.md`). Damit ist Canva-Platzhalter → Figma-Final ein reiner Datei-Tausch,
ohne eine einzige Codezeile.

---

## 7. Speichersystem

- Ein versioniertes Save-Objekt (`SaveDataV1`), reines JSON.
- **Migrationskette**: `migrate(save)` läuft `v1 → v2 → v3 …` durch. Alte Stände gehen nie verloren.
- Getrennte Slots: `profile` (Meta-Progression) und `raid` (laufender Raid, für App-Unterbrechung).
- Autosave: bei jedem Basis-Ereignis + beim Raid-Ende + bei `visibilitychange` (Mobile-Kill).

---

## 8. Performance-Budget (iPhone 11, 60 FPS = 16,6 ms)

| Posten | Budget |
|--------|--------|
| Simulation (60 Hz) | ≤ 3,0 ms |
| Rendering (Pixi Draw Calls) | ≤ 8,0 ms |
| UI-Update (DOM) | ≤ 1,5 ms |
| Reserve / GC | ≥ 4,0 ms |
| **Draw Calls / Frame** | **≤ 60** (via Sprite-Batching + Texture-Atlas) |
| **Aktive Entities** | ≤ 300 |
| **Peak-RAM** | ≤ 350 MB |

Harte Regeln: keine Allokationen in Hot-Loops (Vec2-Pooling), keine `filter/map` pro Frame in Systemen,
Objekt-Pools für Projektile und Partikel.

---

## 9. Qualitätssicherung

| Gate | Befehl | Wann |
|------|--------|------|
| Typprüfung | `npm run typecheck` | vor jedem Commit |
| Unit-/Sim-Tests | `npm test` | vor jedem Commit |
| Architektur-Grenzen | `npm run check:boundaries` | vor jedem Commit |
| Alles zusammen | `npm run verify` | Definition of Done pro Modul |

**Definition of Done** für ein Modul:
1. Implementiert, 2. getestet, 3. `npm run verify` grün, 4. `docs/modules/<modul>.md` geschrieben,
5. im Prototyp sichtbar/spürbar integriert.
