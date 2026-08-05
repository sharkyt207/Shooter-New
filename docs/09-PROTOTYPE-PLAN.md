# PROJECT ECHO — Ablauf des ersten spielbaren Prototyps (M1)

> Dokument-Status: **verbindlich** · Version 1.0

---

## 1. Ziel

Ein **vollständiger, ehrlicher Gameplay-Loop** — nicht schön, aber richtig gebaut.
Alles, was hier entsteht, ist Produktionscode, kein Wegwerf-Prototyp.

---

## 2. Der Spielablauf, Schritt für Schritt

### Schritt 1 — Start
App lädt → Hauptmenü mit Logo, „Raid starten", „Fortsetzen", Version.
Der Spielstand wird geladen; existiert keiner, wird ein Startprofil erzeugt
(Startwaffe `Splitter VK-2`, 1 Feldverband, 60 Munition, 500 Credits).

### Schritt 2 — Basis
Übersicht der Operationsbasis:
- **Lager** — dauerhaftes Inventar (überlebt den Tod)
- **Werkbank** — Grundgerüst mit einem Rezept
- **Händler** — Verkaufen von Beute, Kaufen von Munition/Medizin
- **Status** — Credits, Level, Raid-Statistik

### Schritt 3 — Loadout
Waffe, Rüstung, Rucksackgröße und bis zu 3 Verbrauchsgüter wählen.
Live-Anzeige: Gesamtgewicht, geschätzter Wert des mitgeführten Gears
(= das, was man beim Tod verliert). **Die Angst beginnt hier.**

### Schritt 4 — Briefing
Prozedural erzeugter Fragment-Mix wird angekündigt:
> „Riss-Signatur 8F3A · Fragmente: Labor · Wald · Frachtterminal · Bedrohung: mittel · Dauer: 10:00"

Ein Tap auf „Riss betreten" startet den Raid mit dem angezeigten Seed.

### Schritt 5 — Der Raid (Kernstück)

```
 t=0:00   Spawn an einer zufälligen Randposition eines Fragments
          Extraction-Zonen sind noch VERSCHLOSSEN
          HUD blendet ein, Steuerung reagiert sofort

 t=0:00+  Erkunden: Container durchsuchen, Bodenloot aufnehmen
          Gegner patrouillieren, reagieren auf Sicht und Geräusch
          Gewicht steigt → Bewegung wird langsamer

 t=2:00   Erste Extraction-Zone öffnet (grüner Marker + Banner + Minimap)

 t=4:00   Zweite Zone öffnet, erste beginnt zu blinken (schließt in 60 s)

 t=5:00   Erste Zone schließt endgültig
          → Der Spieler MUSS abwägen: weiter looten oder zur zweiten Zone?

 t=8:00   Letzte Zone öffnet, weit entfernt vom Spawn

 t=10:00  Raid-Ende. Wer nicht extrahiert ist, gilt als verschollen → alles verloren.
```

**Extraction:** In der Zone stehen → 5-Sekunden-Halte-Timer mit Ringfortschritt.
Zone verlassen bricht ab. Getroffen werden bricht ab. Danach: Beute gesichert.

**Tod:** Rucksack-Inhalt und ausgerüstetes Gear sind weg. Lager bleibt unberührt.
Echo-Splitter (Meta-Währung) werden anteilig behalten → auch ein Tod erzeugt Fortschritt (Pillar P5).

### Schritt 6 — Ergebnis
- Ausgang: **EXTRAHIERT** oder **GEFALLEN**
- Aufgelistete Beute mit Wert, Erfahrungsgewinn, Raid-Dauer, Kills, gefundene Items
- Bei Erfolg: Beute wandert automatisch ins Lager
- Button „Zurück zur Basis" → Loop schließt sich

---

## 3. Umfang des Prototyps (bewusst begrenzt)

| Bereich | Im Prototyp enthalten | Verschoben auf |
|---------|----------------------|----------------|
| Waffen | 3 Waffen, 2 Munitionstypen | Mods, Haltbarkeit → M2 |
| Gegner | 2 Archetypen (Streuner, Ordensläufer) | Squads, Bosse → M3 |
| KI | Sichtkegel, Gehör, 6-Zustands-FSM | Flankieren, Flow-Fields → M3 |
| Karte | 3 Biome, prozedurale Fragment-Kette | Raum-Prefabs, Türen → M4 |
| Anomalien | 1 Typ (`Stillstand`) als Machbarkeitsnachweis | alle 5 → M4 |
| Loot | Container + Bodenloot, 4 Tabellen | Durchsuchungs-Zeit, Schlüssel → M4 |
| Inventar | Gewicht, Ausrüsten, Benutzen, Ablegen | Sichere Container, Versicherung → M5 |
| Basis | Lager, Händler, Werkbank-Grundgerüst | Ausbaustufen, Bauzeit → M5 |
| Speichern | Vollständig, versioniert, mit Migration | Cloud-Sync → M6 |
| Audio | Stub-Interface (kein Ton) | echtes Audio → M7 |

---

## 4. Technische Reihenfolge des Aufbaus

Genau diese Reihenfolge wird abgearbeitet — jeder Schritt ist erst fertig, wenn `npm run verify` grün ist:

```
 1. Toolchain + Boundary-Check         → Fundament steht
 2. core/ (ECS, Math, RNG, Events, Zeit)
 3. content/ (Items, Waffen, Gegner, Loot, Biome, Balance)
 4. game/map          → Welt existiert
 5. game/player       → Spieler existiert und bewegt sich
 6. game/weapons + combat → Spieler kann schießen
 7. game/enemies + ai → Welt wehrt sich
 8. game/loot + inventory → Es gibt etwas zu verlieren
 9. game/extraction   → Es gibt einen Ausweg
10. game/save + base + economy → Der Loop schließt sich
11. render/           → Man sieht es
12. ui/               → Man kann es bedienen
13. app/              → Alles ist verdrahtet
14. Tests + Doku      → Es bleibt wartbar
```

---

## 5. Testplan

| Testart | Umfang |
|---------|--------|
| Unit | Vec2-Mathematik, Kollisionsformen, Skalar-Helfer |
| Determinismus | Gleicher Seed ⇒ identische Karte, identische Loot-Rolls, identischer AI-Verlauf |
| Inventar | Gewichtsgrenzen, Stapeln, Überladung, Ausrüsten/Ablegen |
| Kampf | Schadensberechnung, Rüstungsreduktion, Tod, Projektil-Lebensdauer |
| Loot | Gewichtete Tabellen liefern erwartbare Verteilungen über 10 000 Rolls |
| Karte | Erzeugte Karte ist zusammenhängend, Spawn ≠ Extraction, alle Zonen erreichbar |
| Save | Round-Trip (speichern → laden → identischer Zustand), Migration v0 → v1 |
| Smoke | 600 Ticks Raid-Simulation headless ohne Fehler und ohne NaN |

---

## 6. Definition of Done für M1

- [ ] Der komplette Loop ist ohne Sackgasse spielbar (Menü → Basis → Raid → Ergebnis → Basis)
- [ ] `npm run verify` ist grün (Typen, Tests, Architekturgrenzen)
- [ ] Determinismus nachgewiesen: gleicher Seed ⇒ gleiches Ergebnis
- [ ] Kein `Math.random()`, kein `any`, keine Dateipfade in `src/game/**`
- [ ] Touch **und** Tastatur/Maus funktionieren
- [ ] Der Spielstand überlebt einen Reload
- [ ] Jedes Modul hat eine Doku unter `docs/modules/`
- [ ] Die vier Erfolgskriterien aus `00-VISION.md` §9 sind subjektiv erfüllt
