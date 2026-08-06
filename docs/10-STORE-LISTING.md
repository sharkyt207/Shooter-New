# App-Store-Auftritt

Entwurf für die Store-Einträge. Kein Marketing-Text um seiner selbst willen:
Die Beschreibung muss in dreißig Sekunden erklären, was das Spiel *ist*, und
darf nichts versprechen, was es nicht tut.

## Titel

```
PROJECT ECHO
```

Untertitel (iOS, max. 30 Zeichen):

```
Isometrischer Extraction
```

## Kurzbeschreibung (Google Play, max. 80 Zeichen)

```
Geh in den Riss. Nimm mit, was du tragen kannst. Komm zurück, wenn du kannst.
```

## Beschreibung

```
Die Erde gibt es nicht mehr.

Kosmische Energie hat Risse in die Wirklichkeit geschlagen. Was übrig blieb,
sind Fragmente fremder Welten, aneinandergenäht: ein Labor neben einer
Raumstation, ein Wald, der in ein Industriewerk übergeht, Eis neben einem
Bunker. Wege, Türen, Ressourcen, Wetter, Licht und Ausgänge verschieben sich
mit jedem Riss.

Du gehst hinein, weil dort alles liegt, was noch etwas wert ist.

DER LOOP
Ausrüstung wählen. In den Riss. Plündern. Entscheiden, wann es genug ist.
Lebend rauskommen — oder alles verlieren, was du mitgenommen hast.

WAS DICH ERWARTET
· Isometrischer Twin-Stick, für Touch gebaut, nicht auf Touch portiert
· Jeder Riss wird neu erzeugt: Räume, Gegner, Wetter, Anomalien, Ausgänge
· Fünf Anomalien, die je ein anderes Problem stellen — eine verlangsamt,
  eine nimmt dir die Anzeigen, eine stößt dich weg, eine zehrt lautlos,
  und eine zeigt dir, wer vor dir hier war
· Ballistik mit Trefferzonen, Durchschlag und Waffenverschleiß
· Gewicht statt Rasterinventar: Was du trägst, entscheidet, wie schnell du bist
· Eine Basis, die zwischen den Raids weiterarbeitet — Werkbank, Medizin,
  Forschung, Waffenwerkstatt, Händler, Schwarzmarkt
· Versicherung und ein sicherer Behälter: Ein schlechter Abend kostet dich
  etwas, aber nie alles

WAS DICH NICHT ERWARTET
· Keine Werbung
· Keine Energie-Timer, die dich vom Spielen abhalten
· Nichts, was mit Geld schneller geht
· Keine Online-Pflicht

Spielbar im Querformat. Ein Raid dauert zehn Minuten.
```

## Schlüsselwörter (iOS, 100 Zeichen)

```
extraction,looter,shooter,isometrisch,sci-fi,survival,roguelite,loot,singleplayer,offline
```

## Altersfreigabe

Angestrebt: **USK 16 / PEGI 16 / App Store 12+**.

Begründung, die im Fragebogen konsistent beantwortet werden muss:

| Frage | Antwort | Warum |
|-------|---------|-------|
| Gewaltdarstellung | gemäßigt, nicht realistisch | Isometrisch, stilisiert, kein Blut-Detail, keine menschlichen Gesichter |
| Schimpfwörter | keine | Keine Sprachausgabe, keine Beleidigungen im Text |
| Glücksspiel | **keines** | Kein Lootbox-Kauf, keine Echtgeld-Zufallsware. Die Crafting-Fehlschlagquote ist kein Kaufvorgang. |
| Käufe im Spiel | **keine** | Es gibt keine |
| Nutzergenerierte Inhalte | keine | Kein Chat, kein Mehrspieler |
| Datenerhebung | keine | Es wird nichts übertragen; der Speicherstand liegt lokal |

Die letzten beiden Zeilen sind der Grund, warum die Datenschutz-Angaben
(„App-Datenschutz" bei Apple, „Data Safety" bei Google) leer bleiben können —
solange das so bleibt. Telemetrie ist für M8 vorgesehen und würde beide
Formulare ändern; das ist eine bewusste Entscheidung und keine Nebensache.

## Screenshots

Der Browser-Smoke-Test erzeugt bereits die richtigen Motive im richtigen
Format (`npm run smoke`, Ausgabe in `.smoke/`):

| Datei | Zeigt | Store-tauglich |
|-------|-------|----------------|
| `12-phone-raid.png` | Raid im Telefonformat mit Taschenlampe | ja |
| `09-light.png` | Nachtseite, Lichtkegel | ja |
| `02-base.png` | Basis mit Questlinie | ja |
| `02d-modules.png` | Ausbau mit Bauzeiten | ja |
| `05-briefing.png` | Briefing mit Wetter und Anomalien | ja |

Das ist bewusst so: Store-Screenshots aus dem laufenden Spiel statt aus einer
Bildbearbeitung zeigen, was der Spieler wirklich bekommt — und veralten nicht
still, weil derselbe Lauf sie bei jeder Änderung neu erzeugt.

Für die Einreichung fehlen die finalen Gerätegrößen (6,7″ und 6,5″ für iOS),
weil dafür ein Gerät oder ein Simulator nötig ist.

## Offen

- Trailer (braucht Aufnahme und Schnitt)
- Lokalisierung der Store-Texte ins Englische — hängt an der Lokalisierung des
  Spiels selbst (siehe `docs/02-ROADMAP.md`, M7)
- Symbolbild für Google Play (1024×500)
