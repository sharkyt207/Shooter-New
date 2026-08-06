# PROJECT ECHO — Technische Entscheidungen (ADRs)

> Dokument-Status: **verbindlich** · Version 1.0
> Format: Architecture Decision Record. Eine Entscheidung wird nie stillschweigend geändert —
> sie wird durch einen neuen ADR ersetzt, der den alten als „abgelöst" markiert.

---

## ADR-001 — Technologie-Stack: TypeScript + PixiJS + Capacitor

**Status:** akzeptiert

**Kontext:** Wir brauchen einen isometrischen 2D-Twin-Stick-Shooter für iOS/Android mit hochwertiger
Optik, der von einem sehr kleinen Team gebaut, automatisiert getestet und iterativ erweitert wird.

**Optionen:**

| Option | Pro | Contra |
|--------|-----|--------|
| **Unity** | Riesiges Ökosystem, Store-Standard | Schwer versionierbar (Szenen/Prefabs als Binär-Assets), Editor-abhängig, langsame Iteration, schwer headless testbar |
| **Godot 4** | Frei, gute 2D-Engine, Text-Szenen | GDScript/C#-Bruch, Editor-zentriert, Mobile-Export-Reibung, Tests umständlich |
| **TypeScript + PixiJS + Capacitor** | Iteration in Sekunden, alles ist Text (perfekt für Git & Review), headless testbare Simulation, ein Stack für Web-Demo + App Store | Kein visueller Editor, Native-Features nur über Plugins |

**Entscheidung:** **TypeScript + PixiJS v8 + Vite**, für die Stores gewrappt via **Capacitor**.

**Begründung:**
1. Für **2D-Isometrik** ist PixiJS erstklassig und auf Mobile sehr performant (WebGL2/WebGPU, Sprite-Batching).
2. **Alles ist Text** → jede Änderung ist reviewbar, diffbar, testbar. Das ist bei kontinuierlicher
   Weiterentwicklung mehr wert als ein Editor.
3. Die **Simulation ist framework-frei** (ADR-002). Sollte je ein Engine-Wechsel nötig werden,
   ist nur die Präsentationsschicht betroffen — nicht das Spiel.
4. Ein Build läuft im Browser (schnelle Playtests per Link) **und** als native App.

**Konsequenzen:** Wir bauen Tooling (Level-Daten, Balance) selbst — dafür gezielt und leichtgewichtig.

---

## ADR-002 — Strikte Trennung von Simulation und Präsentation

**Status:** akzeptiert

**Entscheidung:** `src/game/**` darf keine Rendering-, DOM- oder Browser-API berühren.
Erzwungen durch `scripts/check-boundaries.mjs` als Teil von `npm run verify`.

**Begründung:** Determinismus, Testbarkeit ohne Browser, Portierbarkeit, spätere Server-Autorität für PvP.

**Konsequenz:** Die Sim darf nicht „mal eben" einen Sound abspielen. Sie **emittiert ein Event**;
`render`/`ui` reagieren. Das ist zu Beginn etwas mehr Arbeit und später der Grund, warum das Projekt skaliert.

---

## ADR-003 — Eigenes, minimalistisches ECS statt Framework

**Status:** akzeptiert

**Entscheidung:** Eigene ~200-Zeilen-ECS-Implementierung (Entity = `number`, Components in `Map`-Stores,
Systeme als reine Funktionen).

**Begründung:** Unser Entity-Budget (≤ 300) braucht keine Archetyp-Optimierung. Volle Kontrolle über
Iterationsreihenfolge ist für Determinismus zwingend. Kein Blackbox-Verhalten, keine Fremd-Breaking-Changes.

**Verworfen:** bitECS/miniplex — Performance-Gewinn irrelevant, Kontrollverlust real.

---

## ADR-004 — Fester Zeitschritt bei 60 Hz mit Render-Interpolation

**Status:** akzeptiert

**Entscheidung:** Simulation exakt 60 Hz. Rendering entkoppelt, interpoliert zwischen den letzten
zwei Sim-Zuständen. Maximal 5 Aufhol-Ticks pro Frame.

**Begründung:** Framerate-unabhängiges Gameplay, reproduzierbare Bugs, stabile Balance über
schwache und starke Geräte hinweg.

---

## ADR-005 — Gewichts-/Slot-Inventar statt Tetris-Grid

**Status:** akzeptiert

**Kontext:** Tarkov-artige Grid-Inventare sind ein Markenzeichen des Genres — und auf einem 6-Zoll-Display
ein Usability-Desaster (Drag & Drop von 1×2-Items mit dem Daumen).

**Entscheidung:** Container mit **Slots + Gewichtslimit**. Items haben `weight` und `stackSize`,
kein `width`/`height`. Überladung erzeugt Bewegungs- und Ausdauer-Malus statt harter Blockade.

**Begründung:** Pillar P4 (Ein Daumen, volle Kontrolle). Das Spannungs-Kernelement ist
*„was lasse ich zurück?"* — das erzeugt Gewicht genauso gut wie ein Raster, ohne Fummelei.

**Konsequenz:** Das Datenmodell bleibt bewusst grid-fähig erweiterbar (Items können später
optionale Maße bekommen), falls ein Tablet-Layout es je rechtfertigt.

---

## ADR-006 — Kein PvP zum Launch

**Status:** akzeptiert

**Entscheidung:** PvE-Extraction zum Launch. Netzwerkcode wird architektonisch **vorbereitet**
(deterministische Sim, Intent-basierte Eingabe), aber nicht gebaut.

**Begründung:** Mobile-PvP mit Extraction erfordert autoritative Server, Anti-Cheat, Matchmaking und
Live-Ops — das ist ein eigenes Projekt. Unsere Spannung kommt aus Welt + Verlustrisiko (Pillar P1/P3).

---

## ADR-007 — DOM/CSS für UI statt Pixi-UI

**Status:** akzeptiert

**Entscheidung:** Die gesamte UI (HUD, Menüs, Inventar, Touch-Sticks) ist HTML/CSS über dem Canvas.

**Begründung:**
- Schrift ist auf Mobile gestochen scharf (kein Canvas-Text-Blur, keine Bitmap-Fonts nötig).
- Natives Touch-Scrolling, Safe-Area-Insets, Accessibility, Barrierefreiheit „gratis".
- **Canva-Exporte sind direkt einsetzbar** (`<img>`/`background-image`) — der schnellste Weg von
  Grafik zu Spiel und der einfachste Tausch gegen finale Assets.
- Kostet ~1,5 ms Frame-Budget, wenn per Dirty-Flags aktualisiert wird. Akzeptabel.

---

## ADR-008 — Assets ausschließlich über logische Keys

**Status:** akzeptiert

**Entscheidung:** Im Code existieren **keine Dateipfade**. Nur logische Keys wie `actor.player` oder
`ui.panel.dark`. Die Auflösung passiert in `public/assets/manifest.json`.
Fehlt ein Asset, erzeugt die `PlaceholderFactory` automatisch eine prozedurale Ersatztextur.

**Begründung:** Grafik darf Entwicklung nie blockieren, und der Wechsel Canva → Figma → Final
muss ein reiner Datei-Tausch sein (Vorgabe aus dem Projektauftrag).

---

## ADR-009 — Deterministischer Zufall mit benannten Streams

**Status:** akzeptiert

**Entscheidung:** `Math.random()` ist in `src/game/**` verboten (Build-Fehler). Stattdessen
`SeededRandom` mit getrennten Streams: `map`, `loot`, `ai`, `combat`.

**Begründung:** Getrennte Streams verhindern, dass eine Änderung im Kampf die Kartengenerierung
verschiebt. Ein Raid ist über `seed` exakt reproduzierbar → Bug-Reports und Balance-Tests werden belastbar.

---

## ADR-010 — Balance-Konstanten zentral in `content/balance.ts`

**Status:** akzeptiert

**Entscheidung:** Kein Balance-Wert steht in einem System. Alles in einer Datei, benannt und kommentiert.

**Begründung:** Balancing ist ein designgetriebener, hochfrequenter Prozess. Er darf keinen
Code-Archäologie-Aufwand erfordern und wird in M8 zur Remote-Config.

---

## ADR-011 — Prozedurale Fragment-Komposition statt Fixkarten

**Status:** akzeptiert

**Entscheidung:** Karten entstehen aus verketteten **Biom-Fragmenten** mit **Nahtzonen**.
Ab M4 kommen handgebaute Raum-Prefabs dazu, die prozedural verkettet werden (Hybrid).

**Begründung:** Direkte mechanische Umsetzung des Settings (Pillar P2) und die einzige Möglichkeit,
mit kleinem Team dauerhaft frische Raids zu liefern. Der Hybrid-Ansatz verhindert die typische
Beliebigkeit rein prozeduraler Level.

---

## ADR-012 — Minimale Abhängigkeiten

**Status:** akzeptiert

**Entscheidung:** Laufzeit-Abhängigkeiten: **nur `pixi.js`**.
Entwicklungsabhängigkeiten: `vite`, `typescript`, `vitest`.

**Begründung:** Jede Abhängigkeit ist ein zukünftiges Migrations- und Sicherheitsrisiko und
kostet Bundle-Größe (= Ladezeit auf Mobilnetz). Kleine Helfer schreiben wir selbst.

---

## ADR-013 — Türzustand liegt im Kollisionsgitter, nicht in der Komponente

**Status:** akzeptiert (M4)

**Kontext.** Mit den Raum-Prefabs bekommt die Karte Türen. Eine Tür beeinflusst
vier Systeme, die alle dieselbe Frage stellen: Kollision („komme ich durch?“),
Sichtlinie („sehe ich hindurch?“), Projektile („fliegt die Kugel durch?“) und
Wegfindung („darf ich hier langlaufen?“). Naheliegend wäre eine `Door`-Komponente,
die jedes dieser Systeme zusätzlich abfragt.

**Entscheidung.** Der Zustand liegt im `MapGrid`: Die Zelle ist `CELL_DOOR`, ein
paralleles `doorOf`-Array hält `DOOR_OPEN | DOOR_CLOSED | DOOR_LOCKED`. Die
`Door`-Entity trägt nur noch, *warum* die Tür zu ist — Schlüssel, Sprite,
Identität.

Daraus folgen drei Abfragen mit klar getrennter Bedeutung:

| Methode | Frage | Geschlossene Tür | Verschlossene Tür |
|---------|-------|------------------|-------------------|
| `isWall` | reine Geometrie (Renderer) | nein | nein |
| `isBlocking` | Bewegung, Sicht, Projektile | **ja** | **ja** |
| `isNavBlocked` | Wegfindung | nein | **ja** |

**Begründung.**

1. **Kein Sonderfall an vier Stellen.** Alle vier Systeme fragen weiterhin genau
   eine O(1)-Gitterabfrage. Es gibt keine Möglichkeit, dass eines von ihnen die
   Tür „vergisst“.
2. **Wegfindung darf anders antworten als Kollision.** Eine geschlossene, aber
   unverschlossene Tür blockiert die Bewegung und *nicht* die Route — wer
   ankommt, öffnet sie. Eine verschlossene blockiert auch die Route, denn Gegner
   tragen nie Schlüssel und würden sich sonst am Rahmen festfahren. Mit einer
   Komponente wäre diese Unterscheidung über vier Systeme verstreut.
3. **Cache-Invalidierung wird trivial.** `grid.version` steigt bei jeder
   Türänderung; der `NavigationCache` verwirft daraufhin veraltete Flow-Fields.
   Eine Tür, die aufgeht, verändert das Gebäude — und die KI weiß es sofort.

**Konsequenzen.** `MapGrid.set()` muss `doorOf` mitlöschen, sonst entsteht
Boden, der weiterhin blockiert (genau dieser Fehler ist in M4 aufgetreten und
hat einen Test bekommen). Der Erreichbarkeits-Flood-Fill läuft bewusst **durch**
verschlossene Türen, weil der Generator garantiert, dass jeder Schlüssel
außerhalb des Raums liegt, den er öffnet.

---

## ADR-014 — Meta-Zufall ist deterministisch und speicherfest

**Status:** akzeptiert (M5)

**Kontext.** M5 bringt Systeme mit Zufall außerhalb des Raids: Crafting kann
fehlschlagen, Versicherung gibt nur einen Teil zurück, Aufträge werden gewürfelt.
Der Raid löst das über benannte Seed-Streams (ADR-009), aber die Basis hat keinen
Seed — sie läuft über Wochen und über beliebig viele Sitzungen.

**Entscheidung.** Das Profil trägt einen Zähler `metaSeed`. Jeder Zug rückt ihn
vor und erzeugt daraus einen Wert:

```ts
nextMetaRandom(profile) {
  profile.metaSeed = (profile.metaSeed + 1) >>> 0;
  return new SeededRandom(profile.metaSeed).float();
}
```

Und, mindestens ebenso wichtig: **Das Ergebnis wird beim Auslösen gewürfelt und
gespeichert, nicht beim Einsammeln.** Ein Crafting-Auftrag trägt sein `failed`
von der Sekunde an, in der er eingereiht wird.

**Begründung.**

1. **Save-Scumming ist sonst trivial.** Würfelt man beim Einsammeln, lädt der
   Spieler den Speicherstand so lange neu, bis der teure Auftrag gelingt. Ein
   System, das sich so aushebeln lässt, kann seine Fehlschlagquote auch gleich
   weglassen — und dann ist die ganze Balance-Arbeit daran verschenkt.
2. **`Math.random()` ist in `game/**` ohnehin verboten** (ADR-009, erzwungen vom
   Boundary-Checker). Der Zähler ist die einzige Variante, die diese Regel
   einhält und trotzdem über Sitzungen hinweg funktioniert.
3. **Angebote bleiben stabil.** Aufträge werden aus `metaSeed` *und* dem
   Acht-Stunden-Fenster gewürfelt. Derselbe Spieler sieht dasselbe Angebot,
   solange das Fenster läuft — kein Neuladen bis der Auftrag passt.

**Konsequenzen.** `metaSeed` gehört in die Speicherstand-Validierung (mindestens
1, ganzzahlig). Tests würfeln nicht nach einem passenden Seed, sondern setzen
`job.failed` direkt — das ist möglich, weil das Ergebnis Daten auf dem Auftrag
sind und keine versteckte Berechnung.

---

## ADR-015 — Native Fähigkeiten nur über Adapter, lazy geladen

**Status:** akzeptiert (M6)

**Kontext.** Capacitor macht aus dem Web-Build eine App. Der naheliegende Weg
wäre, seine Plugins dort zu importieren, wo sie gebraucht werden — Haptik im
HUD, Preferences im Speichersystem, Lebenszyklus in `game.ts`.

**Entscheidung.** Jede native Fähigkeit bekommt eine Schnittstelle in
`src/platform/**`, eine Web-Implementierung, eine native Implementierung und
eine `create…()`-Funktion, die zur Laufzeit wählt. Native Plugins werden
ausschließlich per `await import()` geladen. Kein Modul außerhalb von
`platform/` nennt Capacitor.

**Begründung.**

1. **Der Browser-Build ist kein Nebenprodukt.** Er ist das, worin entwickelt,
   getestet und gemessen wird (`npm run smoke`, `npm run measure`). Er darf für
   native Brücken nicht bezahlen. Gemessen: der statische Import von
   `@capacitor/core` kostete 43 kB für einen String-Vergleich — ersetzt durch das
   injizierte `window.Capacitor`. Die Plugins liegen jetzt in Chunks von 0,3 bis
   1,2 kB, die ein Browser nie anfordert.
2. **Der Boundary-Checker erzwingt es ohnehin.** `game/**` darf `platform/**`
   nicht importieren; die Regel gab es seit M0, und M6 hat sie nur eingelöst.
3. **Adapter sind testbar, Plugins nicht.** Jede Fähigkeit hat einen Test für
   den Fall, dass sie *fehlt* — kein Runtime, ein Runtime der wirft, eine
   Vibration-API die es nicht gibt. Das ist der Normalfall in jedem Unit-Test
   und in jedem Browser, und deshalb der Fall, der funktionieren muss.

**Konsequenzen.** Eine native Fähigkeit ist erst benutzbar, wenn sie einen
Adapter hat — das ist Reibung, und sie ist beabsichtigt. Wer Capacitor eines
Tages ersetzt, tauscht Dateien in `platform/native/`, sonst nichts.

---

## ADR-016 — Deutsch ist die Quellsprache, der Schlüssel ist der Quelltext

**Status:** akzeptiert (M7)

**Kontext.** Das Spiel ist auf Deutsch geschrieben: Menüs, Gegenstandsnamen,
Anomalie-Beschreibungen, Questtexte. Für Englisch braucht es eine
Übersetzungsschicht. Der Branchenstandard ist ein Katalog mit künstlichen
Schlüsseln (`ui.loadout.confirm`) und **je Sprache** einer Datei — auch für die
Sprache, in der der Text ursprünglich geschrieben wurde.

**Entscheidung.** Der Katalog wird mit der **deutschen Zeichenkette selbst**
geschlüsselt, gettext-Stil. `t('Ausrüstung wählen')` schlägt in `en.ts` nach und
liefert bei fehlendem Eintrag den Aufrufparameter zurück. Für Deutsch existiert
kein Katalog. Kollidierende Quellzeichenketten werden über einen `context`
getrennt, dessen Schlüssel `context + U+0004 + source` lautet.

**Begründung.**

1. **Der schlimmste Fehlerfall wird harmlos.** Mit Kennungen zeigt ein fehlender
   Eintrag `ui.base.title` auf dem Bildschirm — kaputt in *jeder* Sprache. Hier
   zeigt er ein deutsches Wort in einem englischen Menü: ein Schönheitsfehler.
2. **Aufrufstellen bleiben lesbar.** Ein Diff, in dem `t('Raid abbrechen')`
   steht, ist prüfbar, ohne einen Katalog aufzuschlagen.
3. **Eine Sprache dazu ist eine Datei.** Kein Umbenennen, keine
   Schlüsseldisziplin, keine Abstimmung zwischen dem, der den Bildschirm
   schreibt, und dem, der übersetzt.
4. **Der Preis ist bezahlbar und maschinell überwacht.** Ändert sich der
   deutsche Text, verwaist sein Eintrag — das ist der reale Nachteil. Ein Test
   scannt jedes literale `t('…')` in `ui/` und `app/` gegen den Katalog und
   findet genau das. Beim ersten Lauf fand er 40 Lücken.

**Konsequenzen.** Übersetzt wird ausschließlich an der Grenze zur Darstellung —
im View-Model und in `ui/`, **nie** in `game/**`, das keine Sprache kennt und
nach ADR-002 keine kennen darf. Konsequenz daraus: Die Simulation liefert
Bestandteile (Name, Menge), nicht fertige Sätze, sonst ließe sich die Sprache
erst zwischen zwei Raids wechseln. Die gewählte Sprache liegt **außerhalb** des
Profils, denn sie gehört zur Person, nicht zur Spielfigur.

---

## ADR-017 — Telemetrie bleibt auf dem Gerät

**Status:** akzeptiert (M8)

**Kontext.** `docs/02-ROADMAP.md` sieht für M8 „Telemetrie: Retention,
Raid-Ausgang, Todesursachen, Economy-Drift" vor. Der übliche Weg ist ein
Analyse-Dienst: SDK einbinden, Ereignisse senden, Diagramme im Webbrowser lesen.

**Entscheidung.** Die Zahlen werden erhoben, aber **nicht gesendet**. Sie liegen
im Gerätespeicher (Schlüssel `telemetry`, 50 Raids im Ringpuffer) und werden dem
Spieler auf einem Bildschirm im Spiel gezeigt, den er löschen kann. Es gibt kein
Analyse-SDK, keine Kennung, keinen Endpunkt.

**Begründung.**

1. **Der Preis wäre nicht technisch, sondern rechtlich.** Ein Analyse-Dienst
   kippt die Datenschutzangaben bei Apple und Google von „keine Daten" auf eine
   Liste, verlangt eine Datenschutzerklärung mit Auftragsverarbeiter und
   möglicherweise ein Einwilligungsbanner — für ein Einzelspielerspiel ohne
   Konto, ohne Chat und ohne Käufe.
2. **Der Nutzen ist kleiner als er klingt.** Aggregierte Ausgangsquoten von
   tausend Spielern sagen dasselbe wie die von einem, der oft spielt, sofern
   sie *lesbar* sind. Also werden sie lesbar gemacht.
3. **Ein Bildschirm ist die stärkere Datenschutzerklärung.** „Wir erheben
   nichts" muss man glauben. „Hier steht alles, was gespeichert ist, und hier
   ist die Löschtaste" kann man nachsehen.

**Konsequenzen.** `game/telemetry` ist ein reiner Ereignis-Konsument ohne Uhr
und ohne Speicherzugriff; `app/` besitzt beides (ADR-002). Die Aufzeichnung
liegt **außerhalb** des Profils — ein Profil-Reset ist genau der Moment, in dem
die Historie am interessantesten ist. `docs/11-COMPLIANCE.md` beantwortet die
Store-Formulare aus diesem ADR heraus; ändert sich die Entscheidung, ändert sich
dieses Dokument zuerst.

---

## ADR-018 — Balance-Zahlen sind überschreibbar, aber nur in Grenzen

**Status:** akzeptiert (M8)

**Kontext.** Ein Store-Review dauert Tage. Eine Waffe, die 15 % zu stark ist,
sollte keine Tage kosten. Gleichzeitig ist eine Konfiguration von außen ein
Einfallstor: Sie kommt über das Netz, sie wird nicht kompiliert, und sie wird
von der Simulation ohne weitere Prüfung geglaubt.

**Entscheidung.** Ein Patch aus `content/balanceOverlay.ts` legt sich beim Start
über `balance.ts`. Er darf nur vorhandene Zahlen bewegen, nur um höchstens
Faktor `MAX_FACTOR` (5), nur unter Beibehaltung des Vorzeichens, und nur einmal
je Sitzung. Alles andere wird mit begründeter Meldung verworfen; der Rest des
Patches gilt trotzdem.

**Begründung.**

1. **Die Grenze ist ein Explosionsradius, keine Designvorgabe.** Faktor 5 deckt
   jede Balance-Entscheidung ab, die jemand tatsächlich treffen würde.
   `PLAYER.maxHealth: 0` deckt sie nicht ab — das ist kein Balancing, das ist
   ein Ausfall, ausgelöst aus der Ferne.
2. **Unbekannte Schlüssel zu erfinden ist schlimmer als sie abzulehnen.** Ein
   Tippfehler, der still eine neue Konstante anlegt, wird eine Woche lang für
   einen Fehler im Spiel gehalten.
3. **Nur beim Start, weil ein Raid je Seed reproduzierbar sein muss** (ADR-009).
   Ein Patch, der mitten in einer Sitzung ankommt, macht aus einem Seed zwei
   verschiedene Spiele.
4. **Struktur ist kein Konfigurationswert.** `META.reputationTiers` ist ein
   Array; wer daran etwas ändert, ändert Spielregeln, nicht Beträge. Solche
   Schlüssel werden abgelehnt.

**Konsequenzen.** Kein Modul darf einen Balance-Wert beim Laden in eine eigene
Konstante kopieren — der Patch würde dort nie ankommen, und die Konfiguration
wäre nachweislich korrekt. Ein Test durchsucht den Quelltext nach diesem Muster.
Die aktive `balanceVersion()` wird auf jeden Telemetrie-Datensatz gestempelt,
damit eine Verschiebung in der Extraktionsquote zugeordnet und nicht vermutet
wird.

---

## ADR-019 — Die Web-App ist der erste Testweg auf ein Telefon

**Status:** akzeptiert (M8)

**Kontext.** Der native Weg über Capacitor braucht einen Mac, Xcode, CocoaPods
und ein Entwicklerkonto (ADR-015, `docs/modules/platform-mobile.md`). Bis dahin
gäbe es keine Möglichkeit, das Spiel auf einem echten Telefon zu bedienen — und
damit keine Möglichkeit, die eine Frage zu beantworten, die kein Test in dieser
Umgebung beantworten kann: Wie fühlt sich der Twin-Stick unter einem Daumen an?

**Entscheidung.** Derselbe `dist/`-Ordner wird zusätzlich als **installierbare
Web-App** ausgeliefert: App-Manifest, Symbole, Service Worker, automatische
Veröffentlichung über GitHub Pages. Der Service Worker ist **handgeschrieben**,
rund achtzig Zeilen, ohne Plugin.

**Begründung.**

1. **Es ist derselbe Build.** Kein zweiter Codepfad, keine Web-Sonderfassung —
   die native Hülle würde exakt diese Dateien umschließen. Was auf dem Telefon
   im Browser falsch aussieht, sieht in der App genauso falsch aus.
2. **Ein Plugin wäre eine Abhängigkeit für achtzig Zeilen.** ADR-012 verlangt
   eine Begründung statt einer Annahme. Ein erzeugter Worker müsste ebenso
   verstanden werden, und er ist das einzige Stück Code zwischen dem Spieler und
   einem schwarzen Bildschirm.
3. **Cache-Politik ist eine Entscheidung, keine Vorgabe.** Gehashte Dateien sind
   inhaltsadressiert und dürfen für immer aus dem Cache kommen; `index.html`
   darf das nicht, weil ein Testbuild, der eine alte Fassung ausliefert,
   schlimmer ist als gar kein Cache. Diese Unterscheidung ist der ganze Worker.

**Konsequenzen.** Der Build darf **keinen absoluten Pfad** enthalten: GitHub
Pages liefert unter `/Shooter-New/` aus, Capacitor aus einem Dateikontext.
`vite.config.ts` steht deshalb auf `base: './'`, und `scripts/smoke-pwa.mjs`
liefert `dist/` bewusst unter einem Unterpfad aus, weil ein absoluter Pfad
lokal tadellos funktioniert und nur dort bricht. Die Grenzen der Web-Fassung
bleiben dokumentiert und sind genau die Begründung für die native: keine
Vibration auf iOS, kein erzwungenes Querformat auf iOS, und ein Spielstand, den
iOS bei Speicherdruck löschen darf.
