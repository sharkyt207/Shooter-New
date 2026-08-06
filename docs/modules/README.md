# Modul-Dokumentation

Eine Datei je fertiggestelltem Modul. Ein Modul gilt erst als fertig, wenn es
implementiert, getestet, optimiert **und** hier dokumentiert ist
(`docs/02-ROADMAP.md`, Arbeitsrhythmus).

| Doku | Module | Reifegrad |
|------|--------|-----------|
| [core.md](core.md) | `core/ecs`, `core/math`, `core/events`, `core/time`, `core/util` | 🟢 fertig |
| [map.md](map.md) | `game/map` | 🟢 Prototyp fertig |
| [combat.md](combat.md) | `game/weapons`, `game/combat` | 🟢 Prototyp fertig |
| [ai.md](ai.md) | `game/ai`, `game/enemies` | 🟢 Prototyp fertig |
| [inventory-loot.md](inventory-loot.md) | `game/inventory`, `game/loot` | 🟢 Prototyp fertig |
| [extraction.md](extraction.md) | `game/extraction`, `game/simulation` | 🟢 Prototyp fertig |
| [meta.md](meta.md) | `game/save`, `game/base`, `game/economy`, `game/crafting` | 🟡 Grundgerüst |
| [presentation.md](presentation.md) | `render/`, `ui/`, `platform/`, `app/` | 🟢 Prototyp fertig |

## Aufbau jeder Modul-Doku

1. **Zweck** — wofür das Modul zuständig ist, und wofür ausdrücklich nicht
2. **Öffentlicher Vertrag** — was andere Module aufrufen dürfen
3. **Datenmodell** — die Komponenten und Strukturen
4. **Entscheidungen** — warum es so gebaut ist
5. **Tests** — was abgesichert ist
6. **Offen / nächster Schritt** — was der nächste Meilenstein bringt
