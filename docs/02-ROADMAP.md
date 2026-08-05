# PROJECT ECHO — Entwicklungsfahrplan

> Dokument-Status: **lebend** · Version 1.0 · Owner: Lead Game Designer

Arbeitsprinzip: **Ein Modul nach dem anderen.** Implementieren → Testen → Optimieren → Dokumentieren →
erst dann das nächste. Kein paralleles Anfangen von Baustellen.

---

## Meilenstein-Übersicht

| # | Meilenstein | Ergebnis | Status |
|---|-------------|----------|--------|
| **M0** | Fundament | Toolchain, Architektur, Core-Layer, Boundary-Check | ✅ abgeschlossen |
| **M1** | Vertical Slice / Prototyp | Spielbarer Raid-Loop End-to-End | ✅ abgeschlossen |
| **M2** | Kampf & Waffen in Tiefe | Waffenmods, Ammo-Typen, Trefferzonen, Rückstoß | 🔜 als nächstes |
| **M3** | Gegner & KI in Tiefe | Fraktionsverhalten, Squads, Bosse, Hören/Sehen | ⏳ geplant |
| **M4** | Welt & Anomalien | Fragment-Generator v2, alle 5 Anomalien, Wetter/Licht | ⏳ geplant |
| **M5** | Meta: Basis, Crafting, Economy | Basisausbau, Werkbänke, Händler, Schwarzmarkt | ⏳ geplant |
| **M6** | Mobile-Härtung | Capacitor, iOS-Build, Performance-Pass, Touch-Politur | ⏳ geplant |
| **M7** | Content & Art-Pass | Finale Assets, Audio, Onboarding, Lokalisierung | ⏳ geplant |
| **M8** | Live-Vorbereitung | Telemetrie, Balancing-Tools, optional PvP-Modul, Store-Release | ⏳ geplant |

---

## M0 — Fundament ✅

**Ziel:** Ein Projekt, in dem sauberes Arbeiten technisch erzwungen wird.

- [x] Vite + TypeScript (strict) + Vitest
- [x] Ordnerstruktur nach Schichtenmodell
- [x] `core/`: ECS, Vec2-Math, SeededRandom, EventBus, FixedClock, Logger
- [x] Boundary-Checker (`scripts/check-boundaries.mjs`) — erzwingt Import-Regeln + Verbot von `Math.random()` in `game/`
- [x] `npm run verify` als Qualitäts-Gate
- [x] Planungsdokumentation (dieses Verzeichnis)

---

## M1 — Vertical Slice (Prototyp) ✅

**Ziel:** Der komplette Loop ist spielbar. Nicht schön, aber **richtig gebaut**.

| Feature | Umfang im Prototyp |
|---------|--------------------|
| Spielfigur | Entity mit Health, Stamina, Inventar, Loadout |
| Bewegung | Beschleunigung/Reibung, Kollision gegen Wände (Kreis vs. AABB) |
| Twin-Stick | 2 virtuelle Sticks (Touch) + WASD/Maus-Fallback (Desktop) |
| Schießen | Projektile mit Streuung, Magazin, Nachladen, Munitionsverbrauch |
| Gegner-KI | FSM: Idle → Patrol → Investigate → Chase → Attack → Flee, mit Sichtkegel & Gehör |
| Loot | Bodenloot + Container mit gewichteten Loot-Tabellen |
| Inventar | Gewichts-/Slot-System, Ausrüsten, Wegwerfen, Verbrauchen |
| Extraction | Mehrere Zonen, dynamische Verfügbarkeit, Halte-Timer |
| Basis | Basisbildschirm mit Lager, Werkbank-Stub, Ausrüstungsauswahl |
| HUD | Health, Stamina, Munition, Minimap, Extraction-Status, Raid-Timer |
| Erste Karte | Prozedurale Fragment-Komposition (3 Biome, Nahtzonen) |
| Speichern | Versionierter Save mit Migrations-Kette, Autosave |

**Exit-Kriterium:** Die vier Punkte aus `00-VISION.md` §9 sind erfüllt.

---

## M2 — Kampf & Waffen (nächster Schritt)

- Waffenmodifikationen (Lauf, Visier, Magazin, Schalldämpfer) mit Stat-Deltas
- Munitionstypen (Penetration vs. Schaden vs. Fragmentierung)
- Trefferzonen & Rüstungs-Layer (Kopf/Torso/Gliedmaßen)
- Rückstoß-Muster, Waffen-Handling-Stats (Ergonomie, ADS-Zeit)
- Nahkampf & Wurfgeschosse (Splitter, Blender, Echo-Köder)
- Waffen-Haltbarkeit und Ladehemmung
- **Doku:** `docs/modules/combat.md`, `docs/modules/weapons.md` erweitern

## M3 — Gegner & KI

- Squad-Koordination (Flankieren, Deckungsfeuer, Rückzug)
- Fraktionsspezifische Profile & Beziehungen untereinander
- Hörsystem mit Materialdämpfung, Schalldämpfer-Interaktion
- Boss: „Wächter" mit Phasen und einzigartigem Loot
- Nav-Grid mit Flow-Fields statt naivem Steering
- **Doku:** `docs/modules/ai.md`

## M4 — Welt & Anomalien

- Fragment-Generator v2: handgebaute Räume als Prefabs, prozedural verkettet
- Alle 5 Anomalien mit Gameplay-Wirkung und VFX
- Dynamisches Licht: Tag/Nacht, Sturm, Riss-Puls, Taschenlampe mit Sichtkegel
- Türen, Schlösser, Schlüsselkarten, verschlossene Hochwert-Räume
- Wetter mit Sicht-/Audio-Auswirkung
- **Doku:** `docs/modules/map.md`, `docs/modules/anomalies.md`

## M5 — Meta-Progression

- Basisausbau: Lager, Werkbank, Medizin, Forschung, Waffenwerkstatt, Händler, Schwarzmarkt
- Ausbaustufen mit Kosten, Bauzeit und Freischaltungen
- Crafting mit Rezepten, Zeit und Fehlschlagchance
- Händler-Tiers, Ruf, dynamische Preise, Aufträge
- Versicherung, Sichere Container, Questlinie „Kartographie der Risse"
- **Doku:** `docs/modules/base.md`, `docs/modules/economy.md`, `docs/modules/crafting.md`

## M6 — Mobile-Härtung

- Capacitor-Integration, iOS-Projekt, Signierung, TestFlight
- Performance-Pass gegen das Budget aus `01-ARCHITECTURE.md` §8
- Texture-Atlanten, Sprite-Batching-Audit, Objekt-Pools überall
- Touch-Politur: Deadzones, Auto-Aim-Assist-Kurven, Haptik
- Safe-Area, Notch, unterschiedliche Seitenverhältnisse, Querformat-Lock
- Hintergrund-/Anruf-Unterbrechung ohne Datenverlust
- **Doku:** `docs/modules/platform-mobile.md`

## M7 — Content & Art-Pass

- Finale Assets ersetzen Platzhalter (Figma/Substance → Atlas)
- Audio: Ambient-Layer, Materialfootsteps, Waffen, Anomalien, adaptive Musik
- Onboarding & Tutorial-Raid
- Lokalisierung DE/EN (Strings sind ab Tag 1 zentralisiert)
- App-Store-Assets: Icon, Screenshots, Trailer, Beschreibung

## M8 — Live-Vorbereitung

- Telemetrie: Retention, Raid-Ausgang, Todesursachen, Economy-Drift
- Balancing über Remote-Config statt App-Update
- Optional: PvP-Modul (autoritativer Server, Sim läuft dort deterministisch)
- Store-Compliance, Datenschutz, Altersfreigabe
- Release

---

## Arbeitsrhythmus pro Modul

```
1. Spezifizieren   → kurze Modul-Doku: Zweck, öffentliche API, Datenmodell
2. Implementieren  → nur dieses Modul, keine Nebenbaustellen
3. Testen          → Vitest, Fokus auf Grenzfälle und Determinismus
4. Optimieren      → Allokationen, Hot-Loops, Draw Calls
5. Dokumentieren   → docs/modules/<name>.md finalisieren
6. Integrieren     → im laufenden Spiel sicht-/spürbar machen
7. Commit          → ein Modul = ein sauberer Commit
```
