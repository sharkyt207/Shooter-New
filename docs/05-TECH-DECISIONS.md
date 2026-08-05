# PROJECT ECHO — Technische Entscheidungen (ADRs)

> Dokument-Status: **verbindlich** · Version 1.0
> Format: Architecture Decision Record. Eine Entscheidung wird nie stillschweigend geändert —
> sie wird durch einen neuen ADR ersetzt, der den alten als „abgelöst" markiert.

---

## ADR-001 — Technologie-Stack: TypeScript + PixiJS + Capacitor

**Status:** akzeptiert

**Kontext:** Wir brauchen einen isometrischen 2D-Twin-Stick-Shooter für iOS/Android mit hochwertiger
Optik, der von einem sehr kleinen Team gebaut, automatisiert getestet und iterativ erweitert wird.

**Optionen:**

| Option | Pro | Contra |
|--------|-----|--------|
| **Unity** | Riesiges Ökosystem, Store-Standard | Schwer versionierbar (Szenen/Prefabs als Binär-Assets), Editor-abhängig, langsame Iteration, schwer headless testbar |
| **Godot 4** | Frei, gute 2D-Engine, Text-Szenen | GDScript/C#-Bruch, Editor-zentriert, Mobile-Export-Reibung, Tests umständlich |
| **TypeScript + PixiJS + Capacitor** | Iteration in Sekunden, alles ist Text (perfekt für Git & Review), headless testbare Simulation, ein Stack für Web-Demo + App Store | Kein visueller Editor, Native-Features nur über Plugins |

**Entscheidung:** **TypeScript + PixiJS v8 + Vite**, für die Stores gewrappt via **Capacitor**.

**Begründung:**
1. Für **2D-Isometrik** ist PixiJS erstklassig und auf Mobile sehr performant (WebGL2/WebGPU, Sprite-Batching).
2. **Alles ist Text** → jede Änderung ist reviewbar, diffbar, testbar. Das ist bei kontinuierlicher
   Weiterentwicklung mehr wert als ein Editor.
3. Die **Simulation ist framework-frei** (ADR-002). Sollte je ein Engine-Wechsel nötig werden,
   ist nur die Präsentationsschicht betroffen — nicht das Spiel.
4. Ein Build läuft im Browser (schnelle Playtests per Link) **und** als native App.

**Konsequenzen:** Wir bauen Tooling (Level-Daten, Balance) selbst — dafür gezielt und leichtgewichtig.

---

## ADR-002 — Strikte Trennung von Simulation und Präsentation

**Status:** akzeptiert

**Entscheidung:** `src/game/**` darf keine Rendering-, DOM- oder Browser-API berühren.
Erzwungen durch `scripts/check-boundaries.mjs` als Teil von `npm run verify`.

**Begründung:** Determinismus, Testbarkeit ohne Browser, Portierbarkeit, spätere Server-Autorität für PvP.

**Konsequenz:** Die Sim darf nicht „mal eben" einen Sound abspielen. Sie **emittiert ein Event**;
`render`/`ui` reagieren. Das ist zu Beginn etwas mehr Arbeit und später der Grund, warum das Projekt skaliert.

---

## ADR-003 — Eigenes, minimalistisches ECS statt Framework

**Status:** akzeptiert

**Entscheidung:** Eigene ~200-Zeilen-ECS-Implementierung (Entity = `number`, Components in `Map`-Stores,
Systeme als reine Funktionen).

**Begründung:** Unser Entity-Budget (≤ 300) braucht keine Archetyp-Optimierung. Volle Kontrolle über
Iterationsreihenfolge ist für Determinismus zwingend. Kein Blackbox-Verhalten, keine Fremd-Breaking-Changes.

**Verworfen:** bitECS/miniplex — Performance-Gewinn irrelevant, Kontrollverlust real.

---

## ADR-004 — Fester Zeitschritt bei 60 Hz mit Render-Interpolation

**Status:** akzeptiert

**Entscheidung:** Simulation exakt 60 Hz. Rendering entkoppelt, interpoliert zwischen den letzten
zwei Sim-Zuständen. Maximal 5 Aufhol-Ticks pro Frame.

**Begründung:** Framerate-unabhängiges Gameplay, reproduzierbare Bugs, stabile Balance über
schwache und starke Geräte hinweg.

---

## ADR-005 — Gewichts-/Slot-Inventar statt Tetris-Grid

**Status:** akzeptiert

**Kontext:** Tarkov-artige Grid-Inventare sind ein Markenzeichen des Genres — und auf einem 6-Zoll-Display
ein Usability-Desaster (Drag & Drop von 1×2-Items mit dem Daumen).

**Entscheidung:** Container mit **Slots + Gewichtslimit**. Items haben `weight` und `stackSize`,
kein `width`/`height`. Überladung erzeugt Bewegungs- und Ausdauer-Malus statt harter Blockade.

**Begründung:** Pillar P4 (Ein Daumen, volle Kontrolle). Das Spannungs-Kernelement ist
*„was lasse ich zurück?"* — das erzeugt Gewicht genauso gut wie ein Raster, ohne Fummelei.

**Konsequenz:** Das Datenmodell bleibt bewusst grid-fähig erweiterbar (Items können später
optionale Maße bekommen), falls ein Tablet-Layout es je rechtfertigt.

---

## ADR-006 — Kein PvP zum Launch

**Status:** akzeptiert

**Entscheidung:** PvE-Extraction zum Launch. Netzwerkcode wird architektonisch **vorbereitet**
(deterministische Sim, Intent-basierte Eingabe), aber nicht gebaut.

**Begründung:** Mobile-PvP mit Extraction erfordert autoritative Server, Anti-Cheat, Matchmaking und
Live-Ops — das ist ein eigenes Projekt. Unsere Spannung kommt aus Welt + Verlustrisiko (Pillar P1/P3).

---

## ADR-007 — DOM/CSS für UI statt Pixi-UI

**Status:** akzeptiert

**Entscheidung:** Die gesamte UI (HUD, Menüs, Inventar, Touch-Sticks) ist HTML/CSS über dem Canvas.

**Begründung:**
- Schrift ist auf Mobile gestochen scharf (kein Canvas-Text-Blur, keine Bitmap-Fonts nötig).
- Natives Touch-Scrolling, Safe-Area-Insets, Accessibility, Barrierefreiheit „gratis".
- **Canva-Exporte sind direkt einsetzbar** (`<img>`/`background-image`) — der schnellste Weg von
  Grafik zu Spiel und der einfachste Tausch gegen finale Assets.
- Kostet ~1,5 ms Frame-Budget, wenn per Dirty-Flags aktualisiert wird. Akzeptabel.

---

## ADR-008 — Assets ausschließlich über logische Keys

**Status:** akzeptiert

**Entscheidung:** Im Code existieren **keine Dateipfade**. Nur logische Keys wie `actor.player` oder
`ui.panel.dark`. Die Auflösung passiert in `public/assets/manifest.json`.
Fehlt ein Asset, erzeugt die `PlaceholderFactory` automatisch eine prozedurale Ersatztextur.

**Begründung:** Grafik darf Entwicklung nie blockieren, und der Wechsel Canva → Figma → Final
muss ein reiner Datei-Tausch sein (Vorgabe aus dem Projektauftrag).

---

## ADR-009 — Deterministischer Zufall mit benannten Streams

**Status:** akzeptiert

**Entscheidung:** `Math.random()` ist in `src/game/**` verboten (Build-Fehler). Stattdessen
`SeededRandom` mit getrennten Streams: `map`, `loot`, `ai`, `combat`.

**Begründung:** Getrennte Streams verhindern, dass eine Änderung im Kampf die Kartengenerierung
verschiebt. Ein Raid ist über `seed` exakt reproduzierbar → Bug-Reports und Balance-Tests werden belastbar.

---

## ADR-010 — Balance-Konstanten zentral in `content/balance.ts`

**Status:** akzeptiert

**Entscheidung:** Kein Balance-Wert steht in einem System. Alles in einer Datei, benannt und kommentiert.

**Begründung:** Balancing ist ein designgetriebener, hochfrequenter Prozess. Er darf keinen
Code-Archäologie-Aufwand erfordern und wird in M8 zur Remote-Config.

---

## ADR-011 — Prozedurale Fragment-Komposition statt Fixkarten

**Status:** akzeptiert

**Entscheidung:** Karten entstehen aus verketteten **Biom-Fragmenten** mit **Nahtzonen**.
Ab M4 kommen handgebaute Raum-Prefabs dazu, die prozedural verkettet werden (Hybrid).

**Begründung:** Direkte mechanische Umsetzung des Settings (Pillar P2) und die einzige Möglichkeit,
mit kleinem Team dauerhaft frische Raids zu liefern. Der Hybrid-Ansatz verhindert die typische
Beliebigkeit rein prozeduraler Level.

---

## ADR-012 — Minimale Abhängigkeiten

**Status:** akzeptiert

**Entscheidung:** Laufzeit-Abhängigkeiten: **nur `pixi.js`**.
Entwicklungsabhängigkeiten: `vite`, `typescript`, `vitest`.

**Begründung:** Jede Abhängigkeit ist ein zukünftiges Migrations- und Sicherheitsrisiko und
kostet Bundle-Größe (= Ladezeit auf Mobilnetz). Kleine Helfer schreiben wir selbst.
