# Module: game/ai, game/enemies

> Schicht 2 · Status 🟢 Prototyp fertig

## Zweck

Wahrnehmung und Verhalten der KI-Gegner. Ziel ist **Bedrohung**, nicht Menge:
wenige Gegner, die glaubwürdig reagieren, erzeugen mehr Spannung als viele, die
stumpf angreifen (Pillar P3).

## Wahrnehmung (`perception.ts`)

Ein Gegner sieht den Spieler, wenn **alle drei** Bedingungen gelten:

1. innerhalb `visionRange`
2. innerhalb des Sichtkegels `visionConeDeg`
3. freie Sichtlinie (DDA-Gitterlauf durch `MapGrid`)

Danach läuft ein Timer: erst nach `awarenessSeconds` gilt das Ziel als bestätigt.

**Diese Verzögerung ist die wichtigste Zahl im Modul.** Ohne sie sind
„gesehen werden" und „beschossen werden" derselbe Moment, und Deckung hört auf,
eine Option zu sein.

| Archetyp | Sicht | Kegel | Gehör | Bestätigung | Gedächtnis |
|----------|-------|-------|-------|-------------|------------|
| Streuner | 12 m | 105° | 15 m | 0,55 s | 5 s |
| Ordensläufer | 17 m | 85° | 18 m | 0,30 s | 9 s |

**Gehör** wird jeden Tick geprüft (ein Schuss muss sofort wirken), **Sicht** nur
alle ~150 ms, gestaffelt über die Entity-ID. Perception ist die teuerste
KI-Arbeit; ohne Staffelung würden alle Gegner im selben Tick rechnen.

Ein Geräusch wird gehört, wenn der Hörer **im Radius des Geräuschs** liegt *und*
das Geräusch in seiner Hörreichweite. Laute Ereignisse tragen weit, taube
Gegner verpassen sie trotzdem.

Bestätigte Sichtungen werden an Verbündete derselben Fraktion im Umkreis von
16 m weitergegeben — sie erhalten die letzte bekannte Position, aber **kein**
bestätigtes Ziel. Sie kommen suchen, nicht schießen.

## Verhalten (`aiSystem.ts`)

```
IDLE ──sieht/hört──► INVESTIGATE ──bestätigt──► CHASE ──in Reichweite──► ATTACK
  ▲                       │                        │                        │
  └────gibt auf───────────┴────────────────────────┘                        │
                                     ▲                                      │
                               FLEE ─┴──── Leben unter Schwelle ────────────┘
```

- **Flucht überschreibt alles.** Ein verwundeter Streuner hört auf, eine
  Bedrohung zu sein, und wird zu einer Entscheidung: Munition ausgeben oder
  laufen lassen?
- **Ohne Sichtkontakt** läuft ein Verfolger zur *letzten bekannten Position*,
  nicht zum Spieler. Verfolgung durch Wände hindurch wäre kein Gegner, sondern
  ein Zielsuchsystem.
- **Abstandshaltung**: Im Angriff hält der Gegner seine `preferredRange` — er
  weicht zurück, wenn man zu nah kommt. Das erzeugt Bewegung im Kampf.
- **Begrenzte Drehrate** (220°/s): Flankieren funktioniert tatsächlich.
- Eine Salve startet erst, wenn der Gegner das Ziel innerhalb von 12° anvisiert
  hat — sonst würde der erste Schuss seitwärts fallen.

## Warum FSM und nicht Behaviour Tree

Bei sechs Zuständen passt das gesamte Verhalten auf einen Bildschirm und ist im
Debug-Overlay direkt ablesbar. Ein Baum lohnt sich ab Squad-Koordination und
Deckungswahl — also ab M3.

## Debug

Pause → „Debug-Ansicht: an" zeichnet je Gegner einen farbigen Zustandsring
(grün = ahnungslos, gelb = untersucht, rot = jagt/greift an) und eine Linie zum
aktuellen Ziel. Anomalien zeigen Radius und tödlichen Kern.

## Offen / nächster Schritt (M3)

- Squad-Koordination: Flankieren, Deckungsfeuer, geordneter Rückzug
- Flow-Field-Navigation statt direktem Anlaufen (aktuell kann ein Gegner an
  einer ungünstigen Ecke hängenbleiben, bis der Zustands-Timeout greift)
- Materialdämpfung beim Hören, Interaktion mit Schalldämpfern
- Boss „Wächter" mit Phasen
- Fraktionsbeziehungen: Streuner und Orden bekämpfen einander
