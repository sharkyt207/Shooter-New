# Modul-Dokumentation

Eine Datei je fertiggestelltem Modul. Ein Modul gilt erst als fertig, wenn es
implementiert, getestet, optimiert **und** hier dokumentiert ist
(`docs/02-ROADMAP.md`, Arbeitsrhythmus).

| Doku | Module | Reifegrad |
|------|--------|-----------|
| [core.md](core.md) | `core/ecs`, `core/math`, `core/events`, `core/time`, `core/util` | 🟢 fertig |
| [map.md](map.md) | `game/map`, `content/prefabs`, `content/weather` | 🟢 M4 fertig |
| [anomalies.md](anomalies.md) | `content/anomalies`, `game/simulation/systems/anomalySystem` | 🟢 M4 fertig |
| [combat.md](combat.md) | `game/weapons`, `game/combat` | 🟢 Prototyp fertig |
| [ai.md](ai.md) | `game/ai`, `game/enemies` | 🟢 Prototyp fertig |
| [inventory-loot.md](inventory-loot.md) | `game/inventory`, `game/loot` | 🟢 Prototyp fertig |
| [extraction.md](extraction.md) | `game/extraction`, `game/simulation` | 🟢 Prototyp fertig |
| [meta.md](meta.md) | `game/save` | 🟢 M5 fertig |
| [base.md](base.md) | `game/base`, `content/baseModules`, `content/quests` | 🟢 M5 fertig |
| [economy.md](economy.md) | `game/economy`, `content/traders`, `content/contracts` | 🟢 M5 fertig |
| [crafting.md](crafting.md) | `game/crafting` | 🟢 M5 fertig |
| [presentation.md](presentation.md) | `render/`, `ui/`, `app/` | 🟢 Prototyp fertig |
| [platform-mobile.md](platform-mobile.md) | `platform/native`, `platform/input`, `platform/storage` | 🟡 M6 — Web fertig, native Builds brauchen einen Mac |
| [audio.md](audio.md) | `platform/audio` | 🟢 M7 fertig |
| [onboarding.md](onboarding.md) | `content/hints`, `game/base/onboarding` | 🟢 M7 fertig |
| [i18n.md](i18n.md) | `core/i18n`, `content/locales` | 🟢 M7 fertig |

## Aufbau jeder Modul-Doku

1. **Zweck** — wofür das Modul zuständig ist, und wofür ausdrücklich nicht
2. **Öffentlicher Vertrag** — was andere Module aufrufen dürfen
3. **Datenmodell** — die Komponenten und Strukturen
4. **Entscheidungen** — warum es so gebaut ist
5. **Tests** — was abgesichert ist
6. **Offen / nächster Schritt** — was der nächste Meilenstein bringt
