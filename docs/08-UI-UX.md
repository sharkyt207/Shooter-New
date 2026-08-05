# PROJECT ECHO — UI/UX-Strategie

> Dokument-Status: **verbindlich** · Version 1.0 · Owner: UI/UX Designer / Mobile Game Specialist

---

## 1. Leitsätze

1. **Daumen zuerst.** Alles Wichtige liegt in den unteren zwei Dritteln, in Daumenreichweite.
2. **Im Raid: maximal 3 Elemente gleichzeitig lesen.** Alles andere ist Rauschen.
3. **Farbe vor Form vor Text.** Der Spieler erkennt Bedeutung, bevor er liest.
4. **Kein Menü im Raid tiefer als 1 Ebene.** Inventar ist ein Overlay, kein Untermenü-Baum.
5. **Jede Aktion gibt Feedback innerhalb von 100 ms** (visuell + haptisch).
6. **Nichts Wichtiges liegt unter dem Daumen**, der gerade steuert.

---

## 2. Bildschirmaufteilung im Raid (Querformat)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⌂ [Vitals]                  ⏱ 08:42            [Minimap]      [⚙]   │  ← obere Leiste
│  ███████░░ HP                                   ┌────────┐           │     (dezent, 12 % Höhe)
│  █████░░░░ STA                                  │  ▲     │           │
│                                                 │    ◆   │           │
│                                                 └────────┘           │
│                                                                      │
│                                                                      │
│                      ◆ SPIELFIGUR (Bildmitte)                        │  ← Spielfeld
│                                                                      │     (freie Sicht!)
│                                                                      │
│                                                                      │
│                            ╭──────────────────╮                      │
│                            │ ▸ AUFNEHMEN      │                      │  ← Kontextaktion
│                            ╰──────────────────╯                      │     (nur wenn relevant)
│                                                                      │
│    ╭────────╮                                     ╭────────╮  [🎒]  │
│    │   ◉    │  Bewegung                Zielen/Feuer│   ◉    │  [💊]  │  ← Steuerung
│    ╰────────╯                                     ╰────────╯  [🔄]   │     (22 % Höhe)
│                              [24/30 · 120]                           │
└──────────────────────────────────────────────────────────────────────┘
```

| Zone | Inhalt | Regel |
|------|--------|-------|
| Oben links | Health, Stamina | Nur Balken, keine Zahlen (Zahlen erst beim Antippen) |
| Oben Mitte | Raid-Timer | Wird ab 2:00 Restzeit rot und pulsiert |
| Oben rechts | Minimap + Pause | Minimap antippbar → vergrößert sich |
| Unten links | Bewegungs-Stick | Dynamischer Ursprung (erscheint, wo der Daumen aufsetzt) |
| Unten rechts | Ziel-/Feuer-Stick | Ziehen = zielen, Loslassen oder Halten = feuern (konfigurierbar) |
| Unten rechts außen | Rucksack, Heilen, Nachladen | 3 feste Buttons, min. 56 × 56 pt |
| Mitte unten | Kontextaktion | Erscheint nur bei Interaktionsmöglichkeit |
| Über den Sticks | Munitionsanzeige | Große Tabellenziffern, immer sichtbar |

---

## 3. Twin-Stick-Steuerung im Detail

### Bewegungs-Stick (links)
- **Dynamischer Ursprung:** Der Stick erscheint dort, wo der Daumen die linke Bildhälfte berührt.
- Deadzone 12 %, volle Geschwindigkeit ab 70 % Auslenkung.
- Radius 90 px logisch, Anzeige halbtransparent (30 % Deckkraft).

### Ziel-Stick (rechts)
- Ebenfalls dynamischer Ursprung in der rechten Bildhälfte.
- **Feuermodus (Standard: „Auslenken = Feuern"):** Auslenkung > 25 % → automatisches Feuern in Zielrichtung.
- Alternativmodus in den Optionen: separater Feuerknopf.
- **Ziel-Assist** (essenziell für Mobile, Kurve in `balance.ts`):
  - Magnetismus: Zielrichtung wird bis zu 8° zum nächsten Gegner im Kegel korrigiert.
  - Kein Auto-Aim ohne Spielereingabe. Der Spieler zielt — wir helfen nur beim Feinschliff.
- Ohne Auslenkung: Blickrichtung folgt der Bewegungsrichtung.

### Desktop-Fallback (Entwicklung & Web-Demo)
`WASD` = Bewegung · Maus = Zielen · Linksklick/Leertaste = Feuern · `R` = Nachladen ·
`E` = Interagieren · `Tab` = Inventar · `Esc` = Pause.

---

## 4. Screen-Flow

```
        BOOT
          │
          ▼
     HAUPTMENÜ ──────────────► OPTIONEN
          │
          ▼
        BASIS ◄──────────────────────────────┐
       ╱  │  ╲                               │
      ▼   ▼   ▼                              │
  LAGER WERK- HÄNDLER                        │
        BANK                                 │
          │                                  │
          ▼                                  │
      LOADOUT  (Waffe, Rüstung, Rucksack,    │
          │     Verbrauchsgüter)             │
          ▼                                  │
    RAID-BRIEFING (Fragment-Mix, Bedrohung,  │
          │        Extraction-Vorschau)      │
          ▼                                  │
        RAID ──► [Inventar-Overlay]          │
          │      [Pause-Overlay]             │
          ▼                                  │
    RAID-ERGEBNIS ─────────────────────────► ┘
    (Extrahiert / Gefallen · Beute · XP)
```

**Maximale Klicktiefe von der Basis in den Raid: 3 Taps** (Loadout → Briefing → Start).

---

## 5. Inventar-UX (mobil-optimiert, ADR-005)

```
┌─── RUCKSACK ────────────────── 14,2 / 20,0 kg ───┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  71 %                      │
├──────────────────────────────────────────────────┤
│  [Icon] Feldverband            ×3    0,6 kg   ▸  │
│  [Icon] 9 mm Kern             ×64    1,3 kg   ▸  │
│  [Icon] Echo-Splitter          ×2    0,4 kg   ▸  │
│  [Icon] Kupferwicklung         ×7    2,1 kg   ▸  │
├──────────────────────────────────────────────────┤
│  AUSGERÜSTET                                     │
│  [Waffe] Splitter VK-2   [Rüstung] Faserweste    │
└──────────────────────────────────────────────────┘
```

- **Liste statt Raster** — natives Scrollen, große Trefferflächen.
- **Ein Tap** öffnet ein Kontextmenü (Ausrüsten · Benutzen · Ablegen · Info) — **kein Drag & Drop**.
- **Sortieren** nach Wert / Gewicht / Kategorie mit einem Tap.
- **Gewichtsbalken** ist das emotionale Zentrum: Er wird ab 85 % gelb, ab 100 % rot und pulsiert.
- **„Loot-All"-Button** an Containern, aber mit sichtbarer Gewichtswarnung — die Entscheidung
  „was lasse ich zurück?" bleibt beim Spieler (Pillar P1).

---

## 6. Feedback-System

| Ereignis | Visuell | Haptik (ab M6) |
|----------|---------|----------------|
| Treffer gelandet | Trefferkreuz + Zahl steigt auf | leicht |
| Schaden erlitten | Roter Randblitz aus Richtung des Schützen | mittel |
| Kritisch (< 25 % HP) | Pulsierende Vignette + gedämpfter Ton | schwer, wiederholt |
| Loot aufgenommen | Icon fliegt zum Rucksack, Seltenheitsfarbe | leicht |
| Nachladen | Ringfortschritt am Feuer-Stick | leicht bei Start und Ende |
| Extraction verfügbar | Grüner Banner + Minimap-Marker | mittel |
| Extraction läuft | Vollbild-Ringfortschritt | wiederholt leicht |
| Tod | Entsättigung, Zeitlupe, dann Ergebnis-Screen | schwer |

---

## 7. Onboarding

- **Kein Textwall-Tutorial.** Der erste Raid ist ein handgeführtes Fragment mit garantiert
  schwachem Gegner, sichtbarem Loot und offener Extraction.
- Kontexthinweise erscheinen **einmalig, an der richtigen Stelle**, und verschwinden nach Ausführung.
- Reihenfolge: Bewegen → Zielen/Feuern → Loot → Gewicht → Extraction → Tod-Konsequenz erklären.
- Der Spieler soll **den ersten Raid gewinnen** und **den zweiten verlieren**. Das lehrt die Loop.

---

## 8. Barrierefreiheit & Komfort

| Feature | Umsetzung |
|---------|-----------|
| Farbenblindheit | Alle Signalfarben zusätzlich durch Form/Symbol codiert (nie Farbe allein) |
| Schriftgröße | Skalierbar (100/125/150 %), UI in `rem` |
| Linkshänder-Modus | Sticks spiegelbar |
| Reduzierte Bewegung | Kamera-Shake und Blitzeffekte abschaltbar |
| Untertitel | Wichtige Audio-Signale (Schritte, Anomalien) optional als Richtungsindikator |
| Safe Area | `env(safe-area-inset-*)` überall respektiert (Notch, Home-Indicator) |
| Einhandmodus | Kompakt-Layout, das alle Buttons in Daumenreichweite verschiebt |

---

## 9. Design-Tokens (CSS-Variablen)

Alle UI-Werte kommen aus Tokens. Kein Hardcoding von Farben oder Abständen in Komponenten.

```css
--color-bg-void:      #080A0F;
--color-panel:        #12161FE6;
--color-echo:         #38E1D4;
--color-extraction:   #5BE37A;
--color-threat:       #FFB13D;
--color-danger:       #FF4D5E;
--color-rare:         #A96BFF;

--space-1: 0.25rem;  --space-2: 0.5rem;  --space-3: 0.75rem;
--space-4: 1rem;     --space-6: 1.5rem;  --space-8: 2rem;

--radius-sm: 4px;  --radius-md: 8px;  --radius-lg: 14px;
--tap-min: 44px;              /* Apple HIG Minimum */
--font-display: 'Barlow Condensed', system-ui, sans-serif;
--font-body:    'Inter', system-ui, sans-serif;
```

**Damit ist ein kompletter Re-Skin (Canva → Figma-Final) eine Änderung der Token-Datei.**
