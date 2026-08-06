# PROJECT ECHO — Asset-Strategie (Canva-Phase)

> Dokument-Status: **verbindlich** · Version 1.0 · Owner: Technical Artist

---

## 1. Kernregel

> **Grafiken sind niemals im Code verankert.**
> Der Code kennt ausschließlich **logische Keys**. Die Zuordnung Key → Datei existiert an genau
> einem Ort: `public/assets/manifest.json`.

```ts
// ✅ so
sprite = assets.get('actor.player');

// ❌ niemals
sprite = Sprite.from('/assets/sprites/player_v3_final.png');
```

Fehlt eine Datei, erzeugt die `PlaceholderFactory` automatisch eine prozedurale Ersatzgrafik in
korrekter Größe und Rollenfarbe. **Fehlende Assets blockieren die Entwicklung nie.**

---

## 2. Die drei Asset-Phasen

| Phase | Quelle | Zweck | Zeitraum |
|-------|--------|-------|----------|
| **P0 — Prozedural** | Code (`PlaceholderFactory`) | Alles ist sofort sichtbar und spielbar, ohne dass eine einzige Datei existiert | M0–M1 |
| **P1 — Canva** | Canva-Exporte (PNG/SVG) | UI, Icons, Menüs, Logos, Konzeptgrafiken, Platzhalter-Sprites | M1–M5 |
| **P2 — Final** | Figma / 3D-Render / Substance | Produktionsqualität, Atlanten, Animationen | M6–M7 |

Der Übergang P1 → P2 ist ein **reiner Dateitausch im Manifest**. Null Code-Änderungen.

---

## 3. Das Asset-Manifest

`public/assets/manifest.json`:

```jsonc
{
  "version": 1,
  "atlases": [],                       // ab P2: Texture-Atlanten
  "textures": {
    "actor.player":      { "src": "sprites/actor_player.png",  "anchor": [0.5, 0.85] },
    "actor.scavenger":   { "src": "sprites/actor_scav.png",    "anchor": [0.5, 0.85] },
    "ui.panel.dark":     { "src": "ui/panel_dark.png",         "slice9": [24,24,24,24] },
    "icon.item.medkit":  { "src": "icons/item_medkit.png" }
  }
}
```

- `anchor` — Fußpunkt für korrekte isometrische Tiefensortierung.
- `slice9` — 9-Slice-Ränder für skalierbare UI-Panels (wichtig für Canva-Exporte!).
- Ein Eintrag darf jederzeit fehlen → Placeholder greift.

---

## 4. Canva-Workflow (Phase P1)

### 4.1 Was in Canva produziert wird

| Kategorie | Beispiele | Format | Ziel-Ordner |
|-----------|-----------|--------|-------------|
| **UI-Panels** | Inventar-Rahmen, HUD-Container, Dialogboxen | PNG mit Transparenz, @2× | `public/assets/ui/` |
| **Buttons** | Primär, Sekundär, Gefahr, Icon-Buttons | PNG @2×, 3 Zustände | `public/assets/ui/` |
| **Item-Icons** | Waffen, Munition, Medizin, Rohstoffe, Echo-Items | PNG 128×128 @2× | `public/assets/icons/` |
| **Logos/Branding** | Spiel-Logo, Fraktionswappen, App-Icon | PNG + SVG | `public/assets/ui/` |
| **Konzeptgrafiken** | Moodboards, Fragment-Skizzen, Anomalien-Studien | JPG | `docs/concept/` (nicht im Build) |
| **Platzhalter-Sprites** | Aktoren, Props, Container | PNG @2× | `public/assets/sprites/` |

### 4.2 Verbindliche Canva-Exportregeln

1. **Immer @2× exportieren** (z. B. Icon-Slot 64 pt → Export 128 px).
2. **PNG mit Transparenz**, kein weißer Hintergrund, keine eingebrannten Schatten bei UI-Panels.
3. **Kein Text in Grafiken einbrennen** — Text kommt aus dem Code (Lokalisierung, Skalierung, Schärfe).
4. **Panels mit gleichmäßigen Rändern** anlegen, damit 9-Slice funktioniert.
5. **Farben strikt aus der Palette** in `06-ART-DIRECTION.md` — Hex-Werte in Canva als Marken-Farben anlegen.
6. **Dateinamen**: `kategorie_name_variante.png`, klein, mit Unterstrich. Keine Versionsnummern
   im Dateinamen (`_final_v3_neu` ist verboten — dafür gibt es Git).
7. **Icons quadratisch, motivzentriert**, 8 % Innenabstand, damit sie in jedem Slot sitzen.

### 4.3 Canva-Projektstruktur (empfohlen)

```
PROJECT ECHO (Canva-Ordner)
├── 01_Branding        Logo, App-Icon, Fraktionswappen
├── 02_UI_Kit          Buttons, Panels, Slots, Leisten, Rahmen
├── 03_Icons_Items     Item-Icons nach Kategorie
├── 04_Icons_UI        Systemicons: Health, Ammo, Gewicht, Extraction
├── 05_Screens         Menü-Mockups (Referenz, nicht exportiert)
└── 06_Concept         Moodboards, Weltskizzen
```

### 4.4 Integrationsschritte

```
1. In Canva gestalten  →  gemäß Exportregeln exportieren
2. Datei in public/assets/<kategorie>/ ablegen
3. Eintrag in manifest.json ergänzen (logischer Key → Pfad)
4. Fertig. Kein Code-Deploy, kein Rebuild von Logik.
```

> Ein Canva-Connector ist in dieser Arbeitsumgebung verfügbar. Damit können Designs direkt erzeugt
> und exportiert werden. Das ändert nichts an der Pipeline — nur an der Geschwindigkeit von Schritt 1.

---

## 5. Namensraum für logische Keys

Ein flacher, punktgetrennter Namensraum. Jeder Key ist im Code eine typisierte Konstante.

```
actor.<name>                actor.player, actor.scavenger, actor.warden
prop.<name>                 prop.crate, prop.locker, prop.barrel
tile.<biome>.<variant>      tile.lab.floor, tile.forest.floor, tile.station.wall
fx.<name>                   fx.muzzleflash, fx.impact.flesh, fx.anomaly.core
icon.item.<id>              icon.item.medkit, icon.item.echoshard
icon.ui.<name>              icon.ui.health, icon.ui.weight, icon.ui.extraction
ui.panel.<variant>          ui.panel.dark, ui.panel.light
ui.button.<variant>         ui.button.primary, ui.button.danger
brand.<name>                brand.logo, brand.appicon
```

---

## 6. Platzhalter-System (Phase P0)

`render/assets/placeholderFactory.ts` erzeugt aus dem Key-Präfix automatisch eine sinnvolle Grafik:

| Präfix | Platzhalter |
|--------|-------------|
| `actor.*` | Kapsel-Silhouette mit Blickrichtungsmarker, Rollenfarbe |
| `prop.*` | Isometrischer Quader mit Kantenlicht |
| `tile.*` | Rautenförmiges Boden-Tile mit dezentem Raster |
| `icon.*` | Abgerundetes Quadrat mit Seltenheitsrahmen + Kürzel |
| `fx.*` | Radialer Farbverlauf |
| `ui.*` | 9-Slice-fähiges Panel mit Rahmen |

Alle Platzhalter nutzen die offizielle Palette → der Prototyp sieht bereits **stimmig** aus,
nicht wie ein Programmierer-Testbild.

---

## 7. Optimierung ab Phase P2

- **Texture-Atlanten** pro Kategorie (`ui`, `icons`, `actors`, `tiles`) → Draw Calls ≤ 60.
- Kompression: **ASTC/ETC2** für native Builds, **WebP/AVIF** für Web.
- Mipmaps für Tiles, keine für UI (Schärfe).
- Budget: Gesamtes Texture-RAM ≤ 180 MB.
- Automatisierter Asset-Report im Build (`npm run assets:report`) — meldet fehlende Keys,
  ungenutzte Dateien und Übergrößen.

---

## 8. Rechtliches

- Nur Assets verwenden, deren Lizenz kommerzielle App-Store-Nutzung erlaubt
  (Canva Pro-Lizenzbedingungen prüfen; Canva-Stock-Elemente sind in Spielen **eingeschränkt**).
- **Deshalb:** Canva-Assets sind ausdrücklich **Platzhalter**. Für den Store-Release werden alle
  Grafiken in Phase P2 durch eigene, uneingeschränkt lizenzierte Assets ersetzt.
- Schriftarten separat lizenzieren (SIL OFL bevorzugt: Inter, Barlow — beide frei kommerziell nutzbar).
- Ein Lizenznachweis pro Asset in `public/assets/CREDITS.md` ab Phase P1.

---

## Nachweis (M7)

Der erste echte Asset-Eintrag ist da: `ui.emblem`, das Riss-Zeichen aus Canva.

Was dafür nötig war:

1. `public/assets/ui/emblem.png` ablegen
2. In `public/assets/manifest.json` eintragen:
   ```json
   "ui.emblem": { "src": "ui/emblem.png", "anchor": [0.5, 0.5] }
   ```

Was **nicht** nötig war: eine Codeänderung. Weder im Renderer noch im
Hauptmenü. Genau das war der Vertrag seit M0 (ADR-008), jetzt an einem realen
Asset nachgewiesen statt behauptet.

### Zwei Consumer, ein Manifest

Der Renderer löst Keys zu Pixi-Texturen auf (`render/assets/assetRegistry.ts`),
die DOM-Oberfläche zu URLs (`ui/assets/uiAssets.ts`). Beide lesen dieselbe
Datei. Ein Logo-Pfad im Stylesheet wäre der zweite Ort für Dateipfade gewesen,
und der zweite Ort ist der, an dem die Regel zu verrotten beginnt.

### Grenzen von Canva, gemessen statt vermutet

- **Wortmarken misslingen.** Die generative Schrifterzeugung verdoppelte
  „PROJECT ECHO" dreimal im selben Bild. Für alles mit Typografie ist Canva in
  dieser Form unbrauchbar — was kein Verlust ist, denn Schrift zeichnet das
  Spiel ohnehin selbst.
- **Wortlose Zeichen gelingen.** Das Emblem traf Palette, Motiv und Stimmung
  auf Anhieb.
- **Transparenz kostet.** PNG-Export mit transparentem Hintergrund braucht
  einen kostenpflichtigen Plan. Behelf: `mix-blend-mode: screen` plus eine
  Radialmaske im CSS — die den Rand zuverlässiger entfernt als Transparenz es
  getan hätte, weil sie unabhängig vom Hintergrund funktioniert.
