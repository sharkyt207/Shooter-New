# PROJECT ECHO — Vision & Creative Direction

> Dokument-Status: **verbindlich** · Version 1.0 · Owner: Creative Director

---

## 1. Elevator Pitch

> **PROJECT ECHO** ist ein isometrischer Mobile-Extraction-Shooter in einer zerbrochenen Realität.
> Du betrittst instabile Weltfragmente, plünderst sie unter Zeitdruck, überlebst Anomalien und KI-Fraktionen –
> und entscheidest bei jedem Schritt neu: **noch ein Raum, oder raus mit der Beute?**

Der zentrale Reiz ist nicht das Töten, sondern die **Angst um das Erreichte**.

---

## 2. Design Pillars

Jede Feature-Entscheidung muss mindestens einen Pillar stärken und darf keinen brechen.

| # | Pillar | Bedeutung | Konsequenz für das Design |
|---|--------|-----------|---------------------------|
| **P1** | **Risiko hat Gewicht** | Alles, was du mitnimmst, kannst du verlieren. | Voller Gear-Loss beim Tod. Versicherung nur als teure Basis-Progression. |
| **P2** | **Die Welt ist nie zweimal gleich** | Echo-Risse rekombinieren Fragmente pro Raid. | Prozedurale Fragment-Komposition statt handgebauter Fixkarten. |
| **P3** | **Spannung vor Action** | Stille, Licht, Geräusch und Unbekanntes tragen die Session. | Wenig Gegner, hohe Bedrohung. Kein Wellen-Shooter. |
| **P4** | **Ein Daumen, volle Kontrolle** | Mobile-first, nicht Mobile-portiert. | Twin-Stick, Auto-Assist, keine Menü-Tiefe > 3 Ebenen im Raid. |
| **P5** | **Jeder Raid zahlt auf die Basis ein** | Auch ein gescheiterter Raid erzeugt Fortschritt (Wissen, Intel, Echo-Splitter). | Meta-Währung, die den Rucksack nicht braucht. |
| **P6** | **Lesbarkeit über Realismus** | Der Spieler muss auf 6 Zoll in 0,3 s alles erfassen. | Stilisierter Look, klare Silhouetten, Farbcodierung. |

---

## 3. Setting — Die Echo-Welt

Die Erde existiert nicht mehr.

Vor Jahrzehnten traf eine unbekannte kosmische Energie die Menschheit. Sie riss die Realität auf:
die **Echo-Risse**. Zeit, Raum und Materie verloren ihre Ordnung.

Was blieb, sind **Fragmente** — herausgeschnittene Stücke ehemaliger Welten, die aneinandergeheftet weiter existieren:

- Ein Forschungslabor endet an einer Waldkante.
- Ein Frachtterminal grenzt an eine Eisfläche.
- Ein Bunkergang mündet in ein Stück Raumstation, das noch atmet.

Zwischen den Fragmenten liegen **Nahtzonen** — instabile Übergänge, in denen die Physik unzuverlässig ist.

### Die Anomalien

Echo-Risse erzeugen lokale Realitätsdefekte. Sie sind **Gefahr und Ressource zugleich**:

| Anomalie | Wirkung | Belohnung |
|----------|---------|-----------|
| **Stillstand** | Verlangsamt alles im Radius, inkl. Projektile | Hochwertige Echo-Kristalle im Kern |
| **Flüstern** | Stört Elektronik: HUD, Minimap, Munitionsanzeige fallen aus | Intel-Fragmente |
| **Rückstoß** | Wirft Masse weg, Sprengschaden bei Kontakt | Seltene Legierungen |
| **Bleiche** | Entzieht Lebensenergie über Zeit, lautlos | Biomasse für Medizin |
| **Echo-Schatten** | Spiegelt vergangene Bewegungen — auch die von Gegnern | Zeigt Loot-Historie des Fragments |

Anomalien sind der **Grund**, warum Karten sich verändern, warum Ausrüstung ausfällt und warum das Spiel
mystisch statt militärisch wirkt. Sie sind unsere wichtigste Identitätsmechanik.

### Die Fraktionen (KI)

| Fraktion | Motiv | Verhalten |
|----------|-------|-----------|
| **Streuner** (Scavengers) | Überleben | Plündern selbst, fliehen bei Übermacht, feige aber zahlreich |
| **Kartograph-Orden** | Kontrolle der Risse | Diszipliniert, Patrouillen, Flankieren, Nachtsicht |
| **Die Verwobenen** | Von Echo-Energie verändert | Unberechenbar, hohe Nahkampfaggression, immun gegen Anomalien |
| **Wächter** (Boss-Tier) | Bewacht Riss-Kerne | Statisch bis provoziert, hoher Loot-Wert, echte Entscheidung |

**Kein PvP zum Launch.** Die Spannung entsteht aus Welt und Verlustrisiko, nicht aus Netcode.
PvP ist als späteres, optionales Modul geplant (siehe Roadmap M8).

---

## 4. Atmosphäre

Ziel-Gefühl: **„Lost Places im Weltraum"**.

- **Nicht**: Militärsimulation, Camouflage-Ästhetik, Taktik-Jargon.
- **Sondern**: Einsamkeit, Neugier, Ehrfurcht, plötzlicher Schrecken.

Leitfrage des Spielers in jeder Sekunde:

> *„Was ist hinter der nächsten Tür?"*

**Audio trägt 50 % der Atmosphäre.** Raumklang, Materialgeräusche, Anomalien-Signaturen,
und lange, bewusste Stille zwischen den Ereignissen.

---

## 5. Core Gameplay Loop

```
        ┌──────────────────────────────────────────────────┐
        │                                                  │
        ▼                                                  │
   VORBEREITUNG ──► LOADOUT ──► RAID BETRETEN              │
                                     │                     │
                                     ▼                     │
                          ┌──── ERKUNDEN ◄────┐            │
                          │        │          │            │
                          │        ▼          │            │
                          │   LOOT / KAMPF ───┘            │
                          │        │                       │
                          │        ▼                       │
                          │  RISIKO ABWÄGEN                │
                          │   „weiter oder raus?"          │
                          │        │                       │
                          └────────┼───────────┐           │
                                   ▼           ▼           │
                              EXTRACTION     TOD           │
                                   │           │           │
                                   ▼           ▼           │
                             BEUTE SICHER   ALLES WEG      │
                                   │           │           │
                                   └─────┬─────┘           │
                                         ▼                 │
                                 BASIS AUSBAUEN ───────────┘
                                 CRAFTING / HÄNDLER
```

**Session-Länge Ziel:** 6–12 Minuten pro Raid (Mobile-Realität: unterbrechbar, Pendlerfreundlich).

---

## 6. Was PROJECT ECHO *nicht* ist

| Nicht | Warum |
|-------|-------|
| Ein Tarkov-Klon | Wir übernehmen die Loop, nicht die Fantasie. Kein Militär-Realismus, keine 1:1-Systeme. |
| Ein Bullet-Hell | Munition ist knapp, Kämpfe sind kurz und tödlich. |
| Ein Idle/Auto-Battler | Der Spieler steuert jede Sekunde selbst. |
| Ein Pay-to-Win-Shop | Monetarisierung nur über Komfort/Kosmetik (siehe Economy-Doc). |
| Ein Live-Service ab Tag 1 | Erst ein exzellentes Solo-Erlebnis, dann Services. |

---

## 7. Zielplattform & Zielgruppe

- **Primär:** iOS (App Store), iPhone 11 / A13 und aufwärts, 60 FPS Ziel, 30 FPS Floor.
- **Sekundär:** Android (identische Codebasis).
- **Entwicklungsplattform:** Desktop-Browser (Maus/Tastatur-Fallback) für schnelle Iteration.
- **Zielgruppe:** 18–35, kennt Extraction-Shooter vom PC, will die Spannung mobil in kurzen Sessions.

---

## 8. Abgrenzung & IP-Sicherheit

Von den Referenzen (Tarkov, Arena Breakout, Delta Force, Dark and Darker, Zero Sievert) übernehmen wir
**ausschließlich Genre-Mechaniken**, die nicht schutzfähig sind:

✅ Erlaubt: Extraction-Loop, Gear-Loss, Loot-Container, Extraction-Timer, Basis-Progression, Händler-Tiers.

❌ Verboten: Namen, Karten, Waffenbezeichnungen, Fraktionslogos, UI-Layouts, Item-Icons, Sound-Signaturen,
Story-Elemente, wörtliche Beschreibungstexte.

**Alle Waffen, Items, Orte und Fraktionen in PROJECT ECHO sind Eigenkreationen mit eigener Namensschule**
(siehe `docs/06-ART-DIRECTION.md`, Abschnitt Naming).

---

## 9. Erfolgskriterien für den Prototyp (M1)

Der Prototyp gilt als erfolgreich, wenn ein fremder Spieler ohne Erklärung:

1. innerhalb von 15 Sekunden versteht, wie er sich bewegt und schießt,
2. innerhalb von 60 Sekunden Loot findet und aufnimmt,
3. spürbar zögert, ob er zur Extraction geht oder weiterläuft,
4. nach dem Tod „nochmal" sagt.

Punkt 3 ist der wichtigste. Wenn er nicht eintritt, stimmt die Balance des Risikos nicht.
