# PROJECT ECHO — Art Direction

> Dokument-Status: **verbindlich** · Version 1.0 · Owner: Technical Artist / Creative Director

---

## 1. Stil-Leitsatz

> **„Stilisierter Realismus mit kosmischem Fehler."**
>
> Klare Formen, ruhige Materialien, kühle Dunkelheit — und darin ein einziger, falscher, leuchtender Farbton,
> der nicht in unsere Physik gehört.

- **Keine Pixelgrafik.** Keine Retro-Ästhetik.
- **Kein Fotorealismus.** Keine Texturflut, keine Militär-Camo-Optik.
- **Sondern:** reduzierte Formensprache, starkes Licht, hoher Kontrast, wenige aber präzise Details.

Der Look muss auf einem 6-Zoll-Display in Bewegung **sofort lesbar** sein (Pillar P6).

---

## 2. Farbsystem

### Basispalette (Welt)

| Rolle | Hex | Einsatz |
|-------|-----|---------|
| Void (Hintergrund) | `#080A0F` | Bereiche außerhalb der Fragmente, tiefster Schatten |
| Deep Slate | `#12161F` | Bodenflächen im Schatten |
| Slate | `#1C2331` | Standard-Boden |
| Concrete | `#2A3344` | Wände, Struktur |
| Fog | `#3D4A5F` | Nebel, entfernte Geometrie |
| Bone | `#C9D1DE` | Helle Kanten, lesbare Silhouettenränder |

### Akzentpalette (Signal)

| Rolle | Hex | Bedeutung — **strikt reserviert** |
|-------|-----|-----------------------------------|
| **Echo Cyan** | `#38E1D4` | Echo-Energie, Anomalien, alles Übernatürliche |
| **Extraction Green** | `#5BE37A` | Rettung, Extraction, Sicherheit |
| **Threat Amber** | `#FFB13D` | Gegner-Alarm, Warnungen, Interaktionsziele |
| **Danger Red** | `#FF4D5E` | Schaden, Tod, verlorene Ausrüstung |
| **Rare Violet** | `#A96BFF` | Seltener Loot, hochwertige Ausrüstung |

**Eiserne Regel:** Diese fünf Akzente sind **funktionale Farben**, keine Deko.
Grün bedeutet im gesamten Spiel ausschließlich „raus hier". Cyan bedeutet ausschließlich „Echo".
Ein Spieler muss die Farbe lesen können, bevor er die Form erkennt.

### Item-Seltenheitsstufen

| Stufe | Farbe | Beispiel |
|-------|-------|----------|
| Common | `#8A94A6` | Schrott, Verbandsmaterial |
| Uncommon | `#5BE37A` | Werkzeug, Standardmunition |
| Rare | `#3DA9FC` | Waffenteile, Elektronik |
| Epic | `#A96BFF` | Echo-Kristalle, Forschungsdaten |
| Legendary | `#FFB13D` | Riss-Kerne, Boss-Loot |

---

## 3. Beleuchtung — das wichtigste Werkzeug

Licht trägt die Atmosphäre stärker als jede Textur. Umsetzung als **eigener Render-Layer**:

```
1. Boden- und Entity-Layer normal zeichnen
2. Dunkelheits-Layer (fast schwarz, multiplikativ) darüber
3. In den Dunkelheits-Layer Licht-Sprites additiv „hineinstanzen":
   - Spieler-Taschenlampe (Kegel, gerichtet)
   - Umgebungslichter (statisch, farbig)
   - Mündungsfeuer (1-Frame-Blitz, hell)
   - Anomalien (pulsierend, Echo-Cyan)
4. Ergebnis multiplikativ auf die Szene
```

Das ergibt auf Mobile für ~2 zusätzliche Draw Calls eine dramatische Lichtstimmung.

**Schatten:** Keine echten dynamischen Schatten (zu teuer). Stattdessen:
- weiche elliptische Kontaktschatten unter jeder Entity (skaliert mit Höhe),
- statisches Ambient-Occlusion an Wandfüßen (in die Tile-Textur gebacken),
- Wände werfen im Lichtkegel Sicht-Blocker (Occlusion) — das liest sich als Schatten und dient dem Gameplay.

---

## 4. Isometrische Projektion

- **Winkel:** 2:1-Isometrie (26,57°) — klassisch, gut lesbar, günstig zu rendern.
- **Tile-Größe:** 128 × 64 px Basis (Retina-tauglich; 1 Weltmeter = 64 px Grundeinheit).
- **Charakterhöhe:** ~1,8 Weltmeter → ca. 115 px hoch.
- **Kamera:** folgt dem Spieler mit weichem Dämpfer, leichter Vorausblick in Zielrichtung,
  Rotation immer 0 (keine Kamerarotation — Lesbarkeit vor Coolness).
- **Tiefensortierung:** nach `y + height`, stabile Sortierung pro Frame.

---

## 5. Formensprache

| Element | Regel |
|---------|-------|
| Silhouetten | Jede Entity-Klasse hat eine eindeutige Umriss-Signatur (Spieler: schlank + Rucksack; Streuner: gebückt; Orden: breite Schultern; Verwobene: asymmetrisch) |
| Kanten | Leichte helle Kantenbeleuchtung (Rim Light) an allen Aktoren → sie heben sich immer vom Boden ab |
| Details | Maximal 3 Detailebenen pro Objekt. Der Rest ist Fläche. |
| Proportionen | Leicht überzeichnet (Kopf ~1,15×) für Lesbarkeit auf kleinen Displays |
| Animation | Wenige, klare Posen mit schnellen Übergängen. Snappy statt weich. |

---

## 6. VFX-Sprache

| Effekt | Aussehen | Zweck |
|--------|----------|-------|
| Mündungsfeuer | 2 Frames, hart, warmweiß | Feedback |
| Treffer (Fleisch) | Kurzer roter Splitter-Burst | Trefferbestätigung |
| Treffer (Umgebung) | Graue Funken + Staubwolke | Verfehlungs-Feedback |
| Echo-Anomalie | Langsam pulsierendes Cyan-Volumen mit Verzerrung | Gefahr, weithin sichtbar |
| Extraction | Aufsteigende grüne Partikel + Bodenring | Zielmagnet |
| Loot-Aufnahme | Kurzer Aufblitz in Seltenheitsfarbe | Belohnungsgefühl |
| Tod (Spieler) | Entsättigung + Vignette + Zeitlupe 0,8 s | Emotionale Interpunktion |

Alle Partikel laufen über **Objekt-Pools**, Budget: ≤ 400 gleichzeitig aktive Partikel.

---

## 7. Naming-Schule (IP-Eigenständigkeit)

Damit nichts nach einer Kopie klingt, folgen alle Eigennamen einer definierten Schule:

| Kategorie | Muster | Beispiele |
|-----------|--------|-----------|
| Waffen | Deutsches/technisches Substantiv + Kürzel-Zahl | `Splitter VK-2`, `Nadel PR-9`, `Bruch SG-40` |
| Munition | Kaliber-artig, aber eigen | `9 mm Kern`, `7,4 Riss`, `12er Streu` |
| Items | Funktional-nüchtern | `Feldverband`, `Kupferwicklung`, `Echo-Splitter` |
| Fraktionen | Bedeutungstragend, nicht militärisch | `Streuner`, `Kartograph-Orden`, `Die Verwobenen` |
| Orte/Fragmente | Sachlich + Nummer | `Labor-Fragment 07`, `Frachtterminal Nord`, `Nahtzone Kalt` |
| Anomalien | Ein deutsches Wort | `Stillstand`, `Flüstern`, `Rückstoß`, `Bleiche`, `Echo-Schatten` |

**Verbotsliste:** Keine realen Waffenhersteller, keine realen Militärbezeichnungen, keine Namen oder
Begriffe aus den Referenzspielen.

---

## 8. Typografie & UI-Ton

- **Headlines:** Kondensierte, technische Grotesk (z. B. Oswald / Barlow Condensed) — Versalien, weite Laufweite.
- **Fließtext/Zahlen:** Neutrale Grotesk (Inter) — Tabellenziffern für Munition und Werte.
- **Ton der Texte:** knapp, sachlich, leicht kalt. Wie Funkverkehr, nicht wie ein Erzähler.
  - ✅ „Extraktion Nord offen. 90 Sekunden."
  - ❌ „Beeile dich, tapferer Held, die Rettung naht!"

---

## 9. Mobile-Auflösungsstrategie

- Assets werden in **@2×** produziert (Basis 1× = logische Punkte).
- Zielauflösung intern: 1280 × 720 logische Punkte, hochskaliert auf das Gerät.
- `resolution` in Pixi = `min(devicePixelRatio, 2)` → Retina-Schärfe ohne Overkill auf 3×-Displays.
- Alle UI-Maße in `rem`/`vmin`, niemals in festen Pixeln.
