# PROJECT ECHO

> Isometrischer Mobile-Extraction-Shooter in einer zerbrochenen Realität.

Die Erde existiert nicht mehr. Eine kosmische Energie hat die Realität aufgerissen — geblieben sind
**Echo-Risse**: instabile Weltfragmente, die sich bei jedem Betreten neu zusammensetzen.
Du gehst hinein, plünderst, überlebst — und entscheidest bei jedem Schritt neu:
**noch ein Raum, oder raus mit der Beute?**

---

## Schnellstart

```bash
npm install
npm run dev        # Entwicklungsserver (Browser: WASD + Maus)
npm run verify     # Typen + Tests + Architekturgrenzen  ← Qualitäts-Gate
```

| Befehl | Zweck |
|--------|-------|
| `npm run dev` | Vite-Entwicklungsserver mit HMR |
| `npm run build` | Produktions-Build nach `dist/` |
| `npm run preview` | Produktions-Build lokal testen |
| `npm test` | Vitest (headless Simulationstests) |
| `npm run typecheck` | TypeScript strict, ohne Emit |
| `npm run check:boundaries` | Erzwingt die Architekturregeln |
| `npm run verify` | Alle drei Gates zusammen |

**Steuerung (Desktop):** `WASD` bewegen · Maus zielen · Linksklick/Leertaste feuern ·
`R` nachladen · `E` interagieren · `Tab` Inventar · `Esc` Pause
**Steuerung (Touch):** zwei dynamische virtuelle Sticks + Kontextbuttons.

---

## Dokumentation

Die Planung ist der Vertrag des Projekts. Vor jeder Änderung gilt: erst das Dokument, dann der Code.

| Dokument | Inhalt |
|----------|--------|
| [00 — Vision](docs/00-VISION.md) | Pitch, Design Pillars, Setting, Gameplay-Loop, Abgrenzung |
| [01 — Architektur](docs/01-ARCHITECTURE.md) | Schichtenmodell, Stack, ECS, Determinismus, Performance-Budget |
| [02 — Roadmap](docs/02-ROADMAP.md) | Meilensteine M0–M8 |
| [03 — Projektstruktur](docs/03-PROJECT-STRUCTURE.md) | Ordnerstruktur und Konventionen |
| [04 — Module](docs/04-MODULES.md) | Modulübersicht mit Verträgen und Reifegrad |
| [05 — Technische Entscheidungen](docs/05-TECH-DECISIONS.md) | ADR-001 … ADR-012 |
| [06 — Art Direction](docs/06-ART-DIRECTION.md) | Stil, Palette, Licht, Isometrie, Naming |
| [07 — Asset-Pipeline](docs/07-ASSET-PIPELINE.md) | Canva-Workflow, Manifest, Platzhalter-System |
| [08 — UI/UX](docs/08-UI-UX.md) | Touch-Steuerung, Screens, Inventar-UX, Barrierefreiheit |
| [09 — Prototyp-Plan](docs/09-PROTOTYPE-PLAN.md) | Ablauf und Umfang von M1 |
| [Module](docs/modules/) | Eine Doku je fertiggestelltem Modul |

---

## Die wichtigste Regel

> **`src/game/` (die Simulation) kennt weder PixiJS noch das DOM.**

Daraus folgt: die Simulation ist deterministisch, headless testbar, der Renderer ist austauschbar
und Multiplayer bleibt später möglich. Die Regel wird maschinell erzwungen —
`npm run check:boundaries` bricht den Build bei einem Verstoß.

```
app/                 Komposition — darf alles kennen
 ├── render/         PixiJS-Präsentation  (liest die Sim)
 ├── ui/             DOM-Overlay, HUD, Screens
 ├── game/           DIE SIMULATION — pures TypeScript
 ├── platform/       Input · Storage · Audio (Interfaces + Adapter)
 ├── content/        Reine Daten: Items, Waffen, Gegner, Balance
 └── core/           ECS · Math · RNG · Events · Zeit
```

---

## Technologie

TypeScript (strict) · Vite · PixiJS v8 · Vitest · Capacitor (ab M6)
Laufzeit-Abhängigkeiten: **genau eine** (`pixi.js`). Begründung: [ADR-012](docs/05-TECH-DECISIONS.md).

---

## Status

**M0 Fundament** ✅ · **M1 Prototyp** ✅ · **M2 Kampf & Waffen** 🔜
Details: [Roadmap](docs/02-ROADMAP.md)

---

## Rechtliches

PROJECT ECHO ist eine Eigenentwicklung. Vom Genre werden ausschließlich nicht schutzfähige
Kernmechaniken übernommen — keine Inhalte, Namen, Assets oder Texte aus anderen Spielen.
Siehe [00-VISION.md §8](docs/00-VISION.md).
