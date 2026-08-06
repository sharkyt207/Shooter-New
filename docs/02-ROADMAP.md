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
| **M2** | Kampf & Waffen in Tiefe | Munitionstypen, Panzerungsklassen, Trefferzonen, Aufsätze, Wurfgeschosse, Nahkampf | ✅ abgeschlossen |
| **M3** | Gegner & KI in Tiefe | Flow-Field-Navigation, Fraktionskrieg, Squads, Wächter-Boss | ✅ abgeschlossen |
| **M4** | Welt & Anomalien | Fragment-Generator v2, alle 5 Anomalien, Wetter/Licht | ✅ fertig |
| **M5** | Meta: Basis, Crafting, Economy | Basisausbau, Werkbänke, Händler, Schwarzmarkt | ✅ fertig |
| **M6** | Mobile-Härtung | Capacitor, Performance-Pass, Touch-Politur | 🟡 Web fertig, native Builds brauchen einen Mac |
| **M7** | Content & Art-Pass | Finale Assets, Audio, Onboarding, Lokalisierung | 🔜 als nächstes |
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

**Ergebnis M1:** Loop vollständig spielbar, 107 Unit-/Simulationstests grün,
Browser-Smoke-Test fehlerfrei, Architekturgrenzen maschinell erzwungen.
Modul-Dokumentation unter `docs/modules/`.

---

## M2 — Kampf & Waffen ✅

**Leitgedanke:** Ein Schuss ist keine Zahl mehr. Was geladen ist, was der Gegner
trägt, wo es trifft, was montiert ist und wie abgenutzt die Waffe ist — jeder
dieser Faktoren ist eine Entscheidung vor dem Raid.

- [x] Waffenmodifikationen (Lauf, Visier, Magazin, Schalldämpfer, Kompensator)
      mit Stat-Deltas — kein Aufsatz ist ein reiner Vorteil
- [x] Munitionstypen: 7 Ladungen über 3 Kaliber, Durchschlag ↔ Schaden ↔
      Fragmentierung als Zielkonflikt; Vollgeschoss macht aus der Schrotwaffe
      eine Mittelstreckenwaffe
- [x] Trefferzonen (gewichtet nach Waffenklasse) und Panzerung nach Klasse mit
      zonenabhängiger Deckung, plus Helm als eigener Slot
- [x] Waffen-Handling: Ergonomie steuert Streuungsabbau
- [x] Nahkampf (Schleichoption mit ×3,2 im Hinterhalt) und drei Wurfgeschosse
      (Splitter, Blender, Echo-Köder)
- [x] Haltbarkeit, Ladehemmung ab Verschleißschwelle, Instandsetzung mit
      sinkendem Höchstzustand
- [x] Werkstatt-Bildschirm mit Delta-Anzeige je Aufsatz
- [x] **Doku:** `docs/modules/combat.md`

**Bewusst verschoben:** Rückstoß als Ziel-Impuls. Auf Twin-Stick würde ein
Zielversatz gegen den Daumen des Spielers arbeiten; das lässt sich ohne Test auf
echter Hardware nicht seriös tunen (M6). Bis dahin bleibt Rückstoß als
Streuungsaufbau modelliert, gedämpft durch Ergonomie.

## M3 — Gegner & KI ✅

**Leitgedanke:** Die Welt hört auf, sich um den Spieler zu drehen.

- [x] **Flow-Field-Navigation** statt naivem Steering — behebt einen echten
      Mangel: Gegner blieben an jeder einspringenden Ecke hängen, bis ihr
      Zustands-Timeout griff
- [x] Fraktionsbeziehungen mit symmetrischer Tabelle; Streuner und Orden
      bekämpfen einander tatsächlich, ob jemand zusieht oder nicht
- [x] Squad-Koordination über ein gemeinsames Blackboard: Rollen (assault,
      suppress, flank), Separation, geteiltes Lagebild
- [x] Doktrin je Fraktion steuert die Taktik (Orden flankiert methodisch,
      Streuner halten Abstand, Verwobene stürmen alle)
- [x] Hörsystem mit Materialdämpfung — halbiert pro durchquerter Wand und lässt
      damit den Schalldämpfer aus M2 endlich zahlen
- [x] Gegner werfen Granaten auf ein Ziel in Deckung: hinter einer Wand zu
      stehen wird von einer Lösung zu einem Timer
- [x] Boss „Wächter" mit drei Phasen, Rüstungsklasse 5 und exklusivem Loot;
      erscheint in 35 % der Raids, weit vom Spawn
- [x] **Doku:** `docs/modules/ai.md`

**Gemessen:** 0,097 ms pro Sim-Tick bei 23 Gegnern und 10 Squads (Budget 3,0 ms).

**Bewusst verschoben:** Deckungspunkte. Gegner suchen Abstand, aber keine
Deckung — das braucht eine Sichtbarkeitsanalyse der Karte und lohnt erst mit den
handgebauten Raum-Prefabs aus M4.

## M4 — Welt & Anomalien ✅

**Ziel:** Die Welt hört auf, eine Kulisse zu sein, und fängt an, eine Gegnerin
zu sein.

| Feature | Umfang |
|---------|--------|
| Fragment-Generator v2 | 8 handgebaute Raum-Prefabs, prozedural eingestempelt, mit eigenen Türen, Loot-, Deckungs- und Gegnerankern |
| Türen | Zustand im Gitter, Öffnen auf Annäherung, Geräusch beim Öffnen, Sicht/Projektile blockiert |
| Schlösser & Schlüsselkarten | Vault-Räume mit `+`-Tür; Schlüssel garantiert in einem Behälter außerhalb |
| Alle 5 Anomalien | Stillstand, Flüstern, Rückstoß, Bleiche, Echo-Schatten — je eine andere *Art* von Problem |
| Wetter | Klar, Nebel, Sturm, Riss-Puls, Nachtseite — skaliert Sicht, Gehör, Licht, Tönung, Partikel |
| Dynamisches Licht | Vignette skaliert mit dem Umgebungslicht; Taschenlampe mit echtem, isometrisch korrektem Sichtkegel |
| Licht als Entscheidung | Lampe an: sehen. Lampe an: gesehen werden (`LIGHT.spottedRangeBonus`) |
| KI-Reaktion auf Anomalien | `avoidance` je Anomalie → statische Kostenkarte im Flow-Field |
| Deckungspunkte | Unterdrückende Gegner besetzen die `C`-Posten der Prefabs und halten sie |

**Gefundene und behobene Fehler dieses Meilensteins**

- `pf_double_chamber` und `pf_cargo` hatten ihre Außentür unter einer Innenwand.
  Der Raum stempelte korrekt und ließ den Erreichbarkeitspass danach das halbe
  Fragment löschen (Seeds 5001/42: 24 statt ~1100 offener Zellen). Behoben, und
  `validatePrefabs()` prüft jetzt Türanschluss **und** Innenkonnektivität.
- `MapGrid.set()` ließ `doorOf` stehen: eine überschriebene Türzelle wurde zu
  Boden, der weiterhin alles blockierte — eine unsichtbare Wand.
- Der Taschenlampenkegel saß neben der Spielfigur: `generateTexture` schneidet
  auf die gezeichnete Geometrie zu, und der Schwerpunkt eines Kreissektors liegt
  nicht auf seiner Spitze. Behoben mit einem transparenten Rahmenrechteck.
  Gefunden vom Browser-Smoke-Test, nicht von den Unit-Tests — genau dafür gibt
  es ihn.

**Doku:** `docs/modules/map.md`, `docs/modules/anomalies.md`

## M5 — Meta-Progression ✅

**Ziel:** Der Loot bekommt ein Ziel jenseits des nächsten Raids.

| Feature | Umfang |
|---------|--------|
| Basisausbau | 7 Module: Lager, Werkbank, Händler, Medizin, Forschung, **Waffenwerkstatt**, **Schwarzmarkt** |
| Bauzeiten | Sofort bezahlt, später fertig; die Uhr läuft **während des Raids** weiter |
| Modulabhängigkeiten | Waffenwerkstatt ← Werkbank 2, Schwarzmarkt ← Händler 3, Forschung ← Werkbank 2 — fehlende Voraussetzungen werden benannt |
| Crafting-Warteschlange | Zeit, Fehlschlagquote (mit 60 % Materialrückgabe), Slots pro Werkbankstufe, 8 Rezepte |
| Drei Händler | Quartiermeister, Feldärztin (Medizin-Aufschlag, kauft keine Waffen), Schwarzmarkt (kauft alles, verkauft teuer) |
| Ruf | Pro Händler, durch Handelsvolumen und Aufträge; bessere Preise und tieferes Sortiment |
| Aufträge | 3 Angebote, alle 8 h neu, deterministisch pro Zeitfenster, laufen nie ab |
| Versicherung | Prämie beim Betreten, Rückgabe nach Verzögerung, nur Getragenes, nie sicher |
| Sicherer Behälter | Überlebt jeden Ausgang, 2,5 kg, „Sichern"-Taste im Raid-Inventar |
| Questlinie | „Kartographie der Risse", 7 Stufen, gespeist ausschließlich aus `RaidOutcome` |
| Speicherstand | v1 → v2 migriert verlustfrei; Warteschlangen mit gelöschtem Inhalt werden verworfen |

**Gefundene und behobene Fehler dieses Meilensteins**

- **Gelddruckmaschine.** Der Kategorie-Aufschlag der Feldärztin galt nur beim
  Ankauf: Bei hohem Ruf zahlte sie 51 für einen Verband, den sie für 48
  verkaufte. Gefunden von dem Test, der die Preisrichtung über *jeden* Händler,
  *jede* Ruf-Stufe und *jede* Modulstufe prüft. Der Aufschlag gilt jetzt auf
  beiden Seiten.
- **Unsichtbare Modulnamen.** `<button>` erbt keine Farbe vom Container, sondern
  bekommt vom Browser `buttontext` — auf dunklem Grund praktisch schwarz. Jedes
  andere Label im Modul-Kärtchen setzt seine eigene Farbe, also war ausgerechnet
  der *Name* unsichtbar. Der Fehler war seit M1 drin und fiel erst auf, als der
  Browser-Smoke-Test den Basis-Tab erstmals fotografierte.
- **Ruf zu langsam.** Die erste Kalibrierung hätte für die dritte Rufstufe rund
  215.000 Credits Handelsvolumen verlangt. Gegen einen echten Raid gerechnet und
  auf ein Vielfaches davon korrigiert.

**Doku:** `docs/modules/base.md`, `docs/modules/economy.md`, `docs/modules/crafting.md`

## M6 — Mobile-Härtung 🟡

**Ziel:** Aus einem Spiel, das im Browser läuft, eine App machen, die ein
Telefon aushält.

| Feature | Umfang |
|---------|--------|
| Capacitor | `capacitor.config.ts`, Plugins, `cap:sync` / `cap:ios` / `cap:android` |
| Nativer Speicher | Capacitor Preferences statt löschbarer localStorage |
| Haptik | Nur für das, was dem Spieler passiert: Treffer, Ladehemmung, Rückstoß, Schloss, Ausgang |
| Lebenszyklus | Web- und native Ereignisse auf dieselben idempotenten Callbacks; Raid pausiert, Profil gespeichert |
| Querformat | Nativ gesperrt; im Browser eine Hinweisebene statt einer Weigerung |
| Stick-Skalierung | Radius als Anteil der kurzen Bildschirmkante statt fester 90 px; der gezeichnete Ring folgt |
| Performance-Werkzeug | `npm run measure` zählt echte WebGL-Draw-Calls; `performance.test.ts` prüft die Budgets aus §8 |
| Smoke-Test | Zusätzlicher Durchlauf im Telefonformat 844×390 |

**Was nicht gemacht werden konnte, und warum**

Diese Umgebung ist Linux: kein macOS, kein Xcode, kein CocoaPods, kein
Signierzertifikat. `npx cap add ios`, der erste Xcode-Build, Signierung und
TestFlight stehen weiterhin aus und sind in `docs/modules/platform-mobile.md`
als exakte Befehlsfolge hinterlegt. Ebenso jede Zahl, die von echter Hardware
kommen muss.

**Der Performance-Pass hat nichts optimiert — absichtlich**

Die Vermutung war, dass einzeln erzeugte Platzhaltertexturen das Sprite-Batching
zerreißen und ein Texture-Atlas fällig wird. Die Messung im Browser sagt **5–7
Draw Calls bei einem Budget von 60**, die Simulation 0,13 ms bei 3,0 ms. Ein
Atlas hätte eine Zahl verbessert, die niemanden stört. Statt einer Optimierung
gibt es jetzt ein Messwerkzeug und einen Budget-Test, damit die Zahlen so
bleiben.

**Gefundene und behobene Fehler dieses Meilensteins**

- 43 kB `@capacitor/core` lagen im Web-Bundle, nur um eine Plattform zu
  benennen. Ersetzt durch das injizierte `window.Capacitor`; die schweren
  Plugins liegen jetzt in Lazy-Chunks, die ein Browser nie anfordert.
- Der Performance-Test importierte `ui` aus `game`. Der Boundary-Checker hat es
  abgefangen — ein Test ist von der Architektur nicht ausgenommen. Die Datei
  liegt jetzt in `app/`, der Schicht, der der Frame gehört.
- Das Hauptmenü behauptete „Prototyp M1".
- Quick-Use-Beschriftungen liefen im Telefonformat aus ihrem Kreis heraus.
  Gemessen auf 844×390 statt geraten.

**Doku:** `docs/modules/platform-mobile.md`

## M7 — Content & Art-Pass (nächster Schritt)

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
