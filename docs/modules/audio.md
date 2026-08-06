# Modul: platform/audio

> Schicht 3 · Status 🟢 M7 — prozedural, spielbar, ohne eine einzige Audiodatei

## Zweck

Die Hälfte der Atmosphäre dieses Spiels ist Ton (docs/00-VISION.md). M1 hat
dafür die Nahtstelle gebaut und `NullAudio` ausgeliefert: der gesamte Aufruf
war da, es passierte nur nichts. M7 hat die Rechnung eingelöst — der Adapter
kam dazu, ohne dass ein einziger Aufrufer angefasst wurde.

## Prozedural statt Dateien

Jede logische Sound-ID löst auf **irgendetwas Hörbares** auf, synthetisiert aus
einer Handvoll Parameter. Das ist genau dasselbe Verhältnis wie zwischen
`PlaceholderFactory` und finaler Grafik: Entwicklung wird nie durch fehlende
Assets blockiert, und echte Samples ersetzen die Synthese später über dieselben
IDs (ADR-008).

Das Vokabular ist bewusst winzig — Rauschen, Ton, Sweep, ein Filter — und
reicht:

```
Schuss        = gefilterter Rauschimpuls + fallender Sägezahn, kurzer Abfall
Nachladen     = drei metallische Klicks im Abstand von 130 ms
Rückstoß-Puls = tiefer Sweep 140 → 36 Hz mit Rauschkörper
Echo-Schatten = schmalbandiges Rauschen, weicher Einsatz, kurz
```

Worauf es in diesem Stadium ankommt, ist nicht Klangtreue, sondern
**Unterscheidbarkeit**: Der Spieler muss eine Ladehemmung von einem Klicken auf
leeres Magazin unterscheiden, ohne hinzusehen. Das ist eine Frage von Hüllkurve
und Tonhöhe, nicht von Aufnahmequalität.

## Was auf einem Telefon schiefgeht, wenn man es nicht bedenkt

**Die Autoplay-Sperre.** Ein `AudioContext` startet angehalten, bis eine
Nutzergeste kommt. Ihn beim Start anzulegen und bei der ersten Berührung
fortzusetzen ist das einzige verlässliche Muster — alles andere ergibt ein
Spiel, das genau für die Spieler stumm bleibt, die nicht zuerst auf die
Leinwand tippen.

**Übersteuern.** Zwanzig überlappende Schüsse durch einen Telefonlautsprecher
sind Verzerrung, nicht Lautstärke. Der Kompressor auf dem Master-Bus ist kein
Feinschliff, sondern der Unterschied zwischen „intensiv" und „kaputt". Dazu ein
Stimmenlimit von 24: Ein Feuergefecht darf keine hundert Knoten erzeugen.

**Lautstärkeverhältnis.** Die UI ist leiser als die Welt, erzwungen von einem
Test. Ein Menü, das laut klickt, führt dazu, dass der Spieler das ganze Spiel
stummschaltet — und damit auch die Geräusche, auf die es ankommt.

## Ambience

Ein langsam wandernder Rauschboden, kein Loop einer Aufnahme. Die Filterfrequenz
driftet über zwanzig Sekunden, denn ohne Drift ist das Bett ein Dauerton, und
ein Dauerton ist das Erste, was ein Spieler stummschaltet.

Der Wechsel zwischen `menu`, `base` und `raid` verschiebt nur den Filter und die
Lautstärke derselben durchlaufenden Quelle — billiger als ein Cross-Fade, und
ohne Naht.

## Positionaler Ton

Stereo-Pan aus der Differenz zur Hörerposition, quadratischer Abfall bis 34 m.
Der Hörer sitzt beim Spieler und wird jeden Frame nachgeführt. Quadratisch statt
linear, weil „weit weg" sich damit deutlich richtiger anhört.

Ohne Position (UI-Töne) spielt alles auf voller Lautstärke — genau richtig, denn
ein Menüklick hat keinen Ort.

## Der eine Klick für alle Knöpfe

`ui.tap` hängt in `ui/components/dom.ts` an der `el()`-Hilfsfunktion, nicht an
sechzig Aufrufstellen. Die Verbindung zum Audio-Dienst ist eine injizierte
Funktion (`setUiFeedback`), damit `ui` nicht in `platform` greifen muss — der
Boundary-Checker würde das ohnehin ablehnen.

## Determinismus

Der Rauschpuffer wird aus einem festen Seed erzeugt. Zwei Läufe klingen
identisch, und nichts hier greift zu einer Zufallsquelle, über die das Projekt
Regeln hat (ADR-009).

## Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| Synthese statt Samples | Kein Ladevorgang, keine Dateien, hörbar ab dem ersten Commit — und dieselbe Ersetzbarkeit wie bei den Platzhaltergrafiken |
| Kompressor auf dem Master | Ein Telefonlautsprecher verzeiht nichts |
| Stimmenlimit 24 | Ein Feuergefecht darf die Audio-Engine nicht fluten |
| UI leiser als die Welt, per Test | Sonst mutet der Spieler das ganze Spiel |
| Ambience als gefilterter Rauschboden mit Drift | Ein Dauerton wird stummgeschaltet |
| Entsperren bei jeder Gestenart, `once` | Welche zuerst kommt, ist nicht vorhersagbar |
| Fallback-Stimme statt Stille | Ein fehlender Ton ist von einem Fehler nicht zu unterscheiden |

## Tests

`src/platform/audio/synthVoices.test.ts` — die Synthese selbst braucht einen
Browser, der **Katalog** aber nicht, und dort stecken die Fehler: jede
spielbare ID hat eine Stimme, keine Verstärkung über 1 (Verzerrung), keine Dauer
über zwei Sekunden, jede Frequenz im hörbaren Bereich, die drei Waffenklassen
unterscheidbar (lauter und dunkler mit dem Kaliber), UI leiser als die Welt,
Ambience leiser als jeder Einzelton.

## Offen / nächster Schritt

- Materialabhängige Schritte (Metall, Laub, Beton) — braucht die Bodenart aus
  dem Biom, die es bereits gibt
- Adaptive Musik: eine Schicht, die auf Bedrohung reagiert
- Echte Samples für Waffen, sobald es welche gibt; die IDs stehen schon
- Ducking der Ambience während eines Rückstoß-Pulses
