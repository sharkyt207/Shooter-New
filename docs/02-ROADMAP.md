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
| **M7** | Content & Art-Pass | Audio, Onboarding, Lokalisierung DE/EN, erste echte Assets, Store-Texte | ✅ fertig |
| **M8** | Live-Vorbereitung | Telemetrie, Balancing-Tools, Compliance, Store-Release | 🟡 Werkzeuge fertig, Release offen |

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

## M7 — Content & Art-Pass ✅

**Ziel:** Das Spiel hört auf, wie ein Prototyp zu klingen und auszusehen.

| Feature | Umfang |
|---------|--------|
| Audio | WebAudio-Adapter mit **prozeduraler** Synthese: 26 Stimmen, Ambience mit Drift, Positionston, Kompressor, Stimmenlimit, Autoplay-Entsperrung |
| Ton im Spiel | Schüsse nach Waffenklasse, Einschläge, Tod, Alarm, Nachladen, Ladehemmung, Anomalien, Türen, Extraktion — und ein Klick für jeden Knopf |
| Onboarding | 13 Hinweise, die auf die **Situation** feuern, einmal für immer, mit Prioritäts-Warteschlange |
| Lokalisierung | Deutsch + Englisch vollständig; Deutsch ist Quellsprache, der Schlüssel ist der deutsche Satz (ADR-016); Umschalten mitten im Raid |
| Erste echten Assets | Riss-Emblem aus Canva, über das Manifest geladen — Hauptmenü und App-Icon aus einer Quelle |
| Store-Auftritt | `docs/10-STORE-LISTING.md`: Beschreibung, Schlüsselwörter, Altersfreigabe-Begründung, Screenshot-Plan |

**Der Asset-Vertrag ist eingelöst**

`ui.emblem` ist der erste echte Asset-Eintrag im Manifest. Eine Datei nach
`public/assets/ui/`, eine Zeile in `manifest.json` — **keine Codeänderung**.
Genau das, was ADR-008 seit M0 versprochen hatte, jetzt an einem realen Asset
nachgewiesen. Dieselbe Datei ist das App-Icon (`resources/icon.png`).

**Eine Korrektur an dieser Roadmap, und ihre Erledigung**

Der M7-Eintrag behauptete „Strings sind ab Tag 1 zentralisiert". Das war
falsch: Die Texte standen deutsch und direkt in den Bildschirmen. Die
Lokalisierung war damit kein Nachziehen, sondern eine echte Extraktion über
alle Screens — rund 113 Aufrufstellen in `ui/` und `app/` plus jeder Name aus
`content/`, der auf einem Bildschirm landet.

Erledigt, und zwar so, dass sie nicht wieder verrottet: Der Abdeckungstest fand
beim ersten Lauf **40 nicht übersetzte Aufrufstellen**, Browser-Screenshots
danach noch einmal Biomnamen, Bedrohungsstufen und zwei Zählformen. Der
Smoke-Test läuft jetzt einen kompletten englischen Durchgang Menü → Basis →
Ausrüstung → Briefing → Raid.

**Gefundene und behobene Fehler dieses Meilensteins**

- **Die Simulation baute Sätze.** Das Interaktionsziel lieferte
  `"Feldverband ×3"` fertig zusammengesetzt an die Oberfläche. Damit hätte sich
  die Sprache nur zwischen zwei Raids wechseln lassen. Jetzt liefert es Name und
  Menge getrennt (ADR-002).
- **Das Kontext-Trennzeichen war mehrdeutig.** Bei einfacher Verkettung ergaben
  `("toas", "tX")` und `("toast", "X")` denselben Schlüssel. Jetzt U+0004, wie
  bei gettext.
- **Die automatische Spracherkennung riss den Smoke-Test.** Headless Chromium
  meldet en-US, also stand da „Enter the rift". Richtiges Verhalten, falscher
  Test: Die Skripte pinnen die Sprache jetzt auf `de-DE`.

**Was Canva liefern konnte und was nicht**

Die Wortmarke misslang zuverlässig: Die generative Schrifterzeugung
verdoppelte „PROJECT ECHO" dreimal im selben Bild. Ein wortloses Emblem
umgeht das Problem vollständig — und ist ohnehin das Richtige, weil ein
App-Icon mit Schrift bei 60 px unlesbar ist. Die Typografie macht das Spiel
selbst, mit echter Schrift.

Ein transparenter PNG-Export braucht einen kostenpflichtigen Canva-Plan; der
Hintergrund wird stattdessen im CSS per `screen` und Radialmaske entfernt.

**Doku:** `docs/modules/audio.md`, `docs/modules/onboarding.md`,
`docs/modules/i18n.md`

**Bewusst nicht in M7**

- Finale Spielgrafik (Figma/Substance): braucht eine Gestalterin, nicht einen
  Generator. Die Pipeline dafür steht und ist nachgewiesen.
- Materialabhängige Schritte und adaptive Musik
- Trailer, Splash-Screen (2732×2732), Play-Symbolbild
- Englische Store-Texte (`docs/10-STORE-LISTING.md` ist deutsch)

## M8 — Live-Vorbereitung 🟡

**Ziel:** Wissen, wie das Spiel läuft, und es korrigieren können, ohne auf ein
Store-Review zu warten.

| Feature | Umfang |
|---------|--------|
| Telemetrie | Ausgang, Todesursachen, Wirtschaftsdrift, Treffer je Schuss, längste Verlustserie — 50 Raids im Ringpuffer |
| Diagnose-Bildschirm | Hauptmenü → Diagnose: die Zahlen lesbar, in beiden Sprachen, mit Löschtaste |
| Balance-Overlay | Geprüfter Patch über `balance.ts`, Faktor-5-Grenze, Teilanwendung mit Begründung je Ablehnung |
| Remote-Config | Nur mit `VITE_BALANCE_CONFIG_URL`; ohne sie existiert kein Netzwerkpfad |
| Compliance | `docs/11-COMPLIANCE.md`: Store-Formulare, Altersfreigabe, Lizenzen |

**Die Telemetrie verlässt das Gerät nicht — und das ist die Entscheidung**

Ein Analyse-Dienst hätte die Datenschutzangaben bei Apple und Google von „keine
Daten" auf eine Liste gekippt, samt Auftragsverarbeiter und womöglich
Einwilligungsbanner. Für ein Einzelspielerspiel ohne Konto, ohne Chat und ohne
Käufe ist das ein hoher Preis für Diagramme, die dasselbe sagen wie die Zahlen
eines Spielers, der oft spielt. Also bleiben sie lokal und werden **lesbar**
gemacht (ADR-017). Der Diagnose-Bildschirm ist bewusst nicht hinter einem
Debug-Schalter: Er zeigt, was gespeichert ist, und löscht es auf Wunsch — eine
überprüfbare Datenschutzerklärung statt einer behaupteten.

**Gefundene und behobene Fehler dieses Meilensteins**

- **Die Todesursache war nicht rekonstruierbar.** `entity:died` sagt *dass*,
  `damage:dealt` sagte *wieviel*, aber nicht *wodurch*. `damage:dealt` trägt
  jetzt eine `cause`, und sie ist an allen sechs Aufrufstellen pflichtig — sonst
  wächst still ein Balken „Beschuss", der nie Beschuss war.
- **Eine Ladezeit-Kopie hätte das ganze Overlay unterlaufen.**
  `loadoutScreen.ts` zog sich beim Laden `META.insuranceReturnChance` in eine
  eigene Konstante. Ein Patch wäre überall angekommen außer dort — bei
  nachweislich korrekter Konfiguration. Ein Test durchsucht den Quelltext jetzt
  nach diesem Muster.
- **„1 Raids"** stand auf dem Diagnose-Bildschirm, weil ein Plural als Suffix im
  Code klebte statt als eigene Quellzeichenkette. Gefunden im Browser, wie immer.

**Nachgewiesen, nicht behauptet**

Ein Build mit gesetzter `VITE_BALANCE_CONFIG_URL` hat eine echte HTTP-Antwort
verarbeitet: zwei Werte übernommen, eine unbekannte Gruppe und einen Wert
jenseits der Faktor-5-Grenze mit Begründung verworfen, und der
Diagnose-Bildschirm wies danach `2026.2-probe` als aktive Balance-Version aus.

**Doku:** `docs/modules/telemetry.md`, `docs/11-COMPLIANCE.md`

**Offen in M8**

- Ein Konfigurationsserver (eine statische Datei hinter einem CDN genügt)
- Store-Material: Splash-Screen 2732×2732, Play-Symbolbild, Screenshots,
  englische Store-Texte, Datenschutz-URL
- **Release** — braucht einen Mac, Xcode, Signierzertifikate und Store-Konten;
  die exakte Befehlsfolge steht in `docs/modules/platform-mobile.md`

**Bewusst nicht gebaut**

- **PvP.** Die Roadmap führte es als „optional". ADR-006 hält fest, warum es
  zum Launch nicht kommt, und nichts an M8 hat daran etwas geändert: Ein
  autoritativer Server ist ein Betriebsaufwand, kein Feature.
- **Export der Aufzeichnung als Datei.** Ein Export ist der erste Schritt zum
  Versand, und der Bildschirm liest sich bereits.

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
