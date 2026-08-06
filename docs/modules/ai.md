# Module: game/ai, game/enemies

> Schicht 2 · Status 🟢 M3 abgeschlossen

## Zweck

Wahrnehmung und Verhalten der KI. Ziel ist **Bedrohung**, nicht Menge: wenige
Gegner, die glaubwürdig reagieren, erzeugen mehr Spannung als viele, die stumpf
angreifen (Pillar P3).

---

## Der Leitgedanke von M3

> **Die Welt hört auf, sich um den Spieler zu drehen.**

Bis M2 gab es genau einen Konflikt: alles gegen den Spieler. Das macht den Riss
zu einer Schießbude, die für einen einzigen Besucher gebaut wurde.

Mit M3 haben Fraktionen echte Beziehungen. Eine Streuner-Bande und eine
Ordens-Patrouille bekämpfen sich, ob jemand zusieht oder nicht — und manchmal
ist das Klügste, was der Spieler tun kann, sie einfach machen zu lassen und
danach einzusammeln, was übrig ist.

---

## 1. Navigation (`navigation.ts`)

**Das war ein echter Mangel, kein fehlendes Feature.** Bis M2 lief ein Gegner
direkt auf sein Ziel zu und rutschte an allem entlang, was er traf. In einem
offenen Raum funktioniert das; an jeder einspringenden Ecke blieb er hängen, bis
sein Zustands-Timeout griff. Das liest sich als Dummheit, nicht als Gegner.

Jetzt: **Flow Fields.** Ein Durchlauf vom Ziel aus erzeugt eine Distanzkarte
über das gesamte Gitter; jede Zelle weiß danach, welcher Nachbar näher liegt.
Dem Gefälle zu folgen erreicht das Ziel garantiert, sofern überhaupt ein Weg
existiert.

- Dijkstra mit Bucket-Verfahren statt Heap — nur zwei Kantengewichte
  (10 gerade, 14 diagonal), also O(Zellen) ohne Allokation pro Knoten
- **Keine diagonalen Eckenschnitte**: Ein Aktor mit echtem Radius würde die
  Wand streifen, an der er sich vorbeiquetscht
- Felder werden **pro Zielzelle zwischengespeichert** und von allen Gegnern mit
  demselben Ziel geteilt — dank Squads ist das der Normalfall
- Cache-Größe 6, LRU-Verdrängung: Neubau ist billig, veraltete Felder sind teuer

**Hybrid im Einsatz:** Bei freier Sicht wird direkt gelaufen, sonst dem Feld
gefolgt. Ein reines Feld wirkt im offenen Raum kantig, reines Direktlaufen
bleibt an jeder Ecke hängen. Zusammen liest es sich wie ein Gegner, der das
Gebäude kennt.

---

## 2. Fraktionen (`content/factions.ts`)

| | Spieler | Streuner | Orden | Verwobene | Wächter |
|---|---|---|---|---|---|
| **Spieler** | – | ⚔ | ⚔ | ⚔ | ⚔ |
| **Streuner** | ⚔ | – | ⚔ | ⚔ | ⚔ |
| **Orden** | ⚔ | ⚔ | – | ⚔ | ⚔ |
| **Verwobene** | ⚔ | ⚔ | ⚔ | – | ⚔ |
| **Wächter** | ⚔ | ⚔ | ⚔ | ⚔ | – |

Die Tabelle wird **symmetrisch konstruiert** — eine einseitige Feindschaft ist
technisch unmöglich.

**Bedrohungsgewichtung:** Alle außer den Wächtern werten den Spieler um Faktor
1,6 höher als andere Feinde. Ohne das könnte man durch ein Gefecht spazieren,
ohne bemerkt zu werden — einmal witzig, danach kaputt. Wächter bewachen einen
Ort, für sie zählt schlicht, wer am nächsten ist.

**Doktrin** je Fraktion steuert die Squad-Taktik:

| Doktrin | Fraktion | Verhalten |
|---------|----------|-----------|
| `opportunist` | Streuner | halten Abstand, schießen, flankieren nicht |
| `disciplined` | Orden | einer bindet, einer flankiert, Rest deckt |
| `frenzied` | Verwobene | alle gleichzeitig, kein Manöver |
| `territorial` | Wächter | halten die Stellung, flankieren nur nah am Kern |

---

## 3. Squads (`squad.ts`)

Ein Squad ist **keine Formation, sondern ein Blackboard.** Mitglieder schreiben
hinein, was sie erfahren, lesen, was die anderen erfahren haben, und einer
verteilt die Rollen. Das reicht für die zwei Dinge, die zählen:

- die Gruppe reagiert als Gruppe, Flankieren wird **emergent** statt geskriptet
- die Gruppe tut nicht alle dasselbe, ein Gefecht bekommt Struktur

```
Rollen (deterministisch, einmal pro Squad pro Tick):
  nächstes Mitglied  → assault   (bindet das Ziel)
  entferntestes      → flank     (schwenkt 7 m zur Seite aus)
  alle übrigen       → suppress  (halten Abstand ×1,25, längere Salven)
```

Bewusst ohne Bewertungsfunktion und ohne Verhandlung — eine stabile Regel, die
der Spieler lesen lernen kann.

- Ein Flanker **wählt seine Seite einmal** und bleibt dabei, statt um das Ziel
  zu pendeln
- **Separation**: Mitglieder drücken sich innerhalb von 1,6 m auseinander, damit
  eine Gruppe nicht zu einem einzigen zielförmigen Klumpen kollabiert
- Squads bilden sich beim Spawn aus Fraktion + Nähe, höchstens 4 Mitglieder
- Tote werden aus dem Squad entfernt — sonst verteilt die Rollenzuweisung
  weiter Aufgaben an Leichen

Wissen wandert damit über die **Squad-Struktur** statt über einen Radius. Das ist
billiger und deutlich vorhersagbarer.

---

## 4. Wahrnehmung

Sicht = im Sichtkegel **und** in Reichweite **und** freie Sichtlinie, gehalten
über `awarenessSeconds`. Diese Verzögerung bleibt die wichtigste Zahl im Modul:
Ohne sie sind „gesehen werden" und „beschossen werden" derselbe Moment.

Neu in M3: **Alle feindlichen Fraktionen sind Kandidaten**, nicht nur der
Spieler. Die Auswahl ist eine Bewertung nach Entfernung, gewichtet nach
Bedrohung — nicht „der erste, den ich finde".

### Hören mit Materialdämpfung

```
hörbarer Radius = ausgesandter Radius × 0,5 ^ (durchquerte Wände)
mehr als 4 Wände → gar nicht hörbar
```

Schall endet nicht an einer Wand, er wird gedämpft. Die Wände einer Geraden zu
zählen ist ein billiger, deterministischer Ersatz für echte Ausbreitung — und
**genau das lässt den Schalldämpfer aus M2 endlich zahlen**: halber ausgesandter
Radius, danach pro Wand noch einmal halbiert. Um eine Ecke herum ist eine
gedämpfte Waffe praktisch lautlos.

Verbündeter Lärm wird ignoriert. Wer den eigenen Leuten hinterherläuft,
untersucht nichts.

---

## 5. Verhalten

```
IDLE ──sieht/hört──► INVESTIGATE ──bestätigt──► CHASE ──in Reichweite──► ATTACK
  ▲                       │                        │                        │
  └────gibt auf───────────┴────────────────────────┘                        │
                                     ▲                                      │
                               FLEE ─┴──── Leben unter Schwelle ────────────┘
```

Die FSM bleibt richtig für diese Größe: Das ganze Verhalten passt auf einen
Bildschirm und ist im Debug-Overlay ablesbar. M3 legt drei Dinge **daneben**,
nicht hinein: Navigation, Squad-Rollen, Phasen.

### Granaten

Der Eingriff, der ein Gefecht am stärksten verändert: **Hinter einer Wand zu
stehen hört auf, eine Lösung zu sein, und wird zu einem Timer.**

Bedingungen — bewusst eng, damit es sich nicht willkürlich anfühlt:

- Ziel seit ≥ 2,2 s ohne Sichtkontakt
- Entfernung zwischen 5 m und 15 m (näher würde der Werfer sich selbst treffen)
- eigene Abklingzeit von 14 s abgelaufen

Nur der Orden und die Wächter tragen Granaten. Streuner nicht — sie hätten
keine.

---

## 6. Der Wächter

Ein Boss, der **kein Lebenspunkte-Schwamm** ist: Der Kampf ändert dreimal seine
Form, und jede Phase stellt eine andere Frage.

| Phase | ab Leben | Tempo | Salventakt | Präzision |
|-------|----------|-------|------------|-----------|
| **Wache** | > 60 % | ×0,85 | ×1,15 | – |
| **Vorstoß** | > 30 % | ×1,15 | ×0,85 | +0,08 |
| **Entfesselt** | > 0 % | ×1,45 | ×0,60 | +0,15 |

Phase 1 bestraft, wer im Freien steht. Phase 2 nimmt der Deckung die
Dauerhaftigkeit. Phase 3 hält nichts mehr zurück.

- Rüstungsklasse 5 — ohne durchschlagsstarke Munition aus M2 praktisch nicht
  zu töten. Der Boss ist damit ein **Test der Vorbereitung**, nicht der Reflexe.
- Erscheint in **35 % der Raids**, im entferntesten Fragment, mindestens 30 m vom
  Spawn. Ein Boss in jedem Riss wäre Routine statt Ereignis.
- Einzige verlässliche Quelle für Riss-Kerne.
- Kündigt sich erst an, wenn er den Spieler **tatsächlich bemerkt** hat — eine
  Lebensleiste für etwas, das man noch nicht getroffen hat, würde verraten,
  dass es da ist.

---

## Debug

Pause → „Debug-Ansicht: an" zeigt je Gegner:

- **Zustandsring**: grün = ahnungslos, gelb = untersucht, rot = jagt/greift an
- **Rollenring**: weiß = assault, cyan = suppress, violett = flank
- Linie zum aktuellen Ziel
- Anomalien mit Radius und tödlichem Kern

---

## Performance

Gemessen headless, 3600 Ticks (eine Minute Spielzeit) mit 23 Gegnern und
10 Squads:

```
0,097 ms pro Tick   (Budget: 3,0 ms)
```

Flow Fields und Squads sind bei dieser Größe praktisch gratis. Die Reserve
reicht für ein Vielfaches der aktuellen Gegnerzahl.

---

## Tests

`ai.test.ts` (20): Flow Field erreicht jede Zelle einer zusammenhängenden Karte,
Kosten steigen mit Entfernung, Umweg um eine Wand statt hinein, vollständiger
Pfadlauf ohne Wandkontakt, unerreichbare Zellen bleiben markiert, keine
diagonalen Eckenschnitte, Cache teilt und verdrängt korrekt, Fraktionstabelle
ist symmetrisch, Wandzählung und Dämpfung, Determinismus.

`squadBehaviour.test.ts` (11): Squad-Bildung, Größengrenze, keine gemischten
Fraktionen, Tote werden vergessen, Sichtung erreicht das ganze Squad, feindliche
Fraktionen verletzen einander tatsächlich, **kein Gegner zielt je auf einen
Verbündeten**, Wächter erscheint nicht immer und nie nah am Spawn, Phasen sind
geordnet und werden schneller, Boss-Banner feuert genau einmal.

---

## Offen / nächster Schritt

- **M4**: KI-Reaktion auf Anomalien — aktuell laufen Gegner ungerührt durch ein
  Stillstand-Feld
- **M4**: Türen als taktische Elemente (öffnen, blockieren, hören)
- **M5**: Fraktionsruf — den Orden zu verschonen könnte Handelsvorteile bringen
- Deckungspunkte: Gegner suchen aktuell Abstand, aber keine Deckung. Das braucht
  eine Sichtbarkeitsanalyse der Karte und lohnt erst mit den Raum-Prefabs aus M4.
