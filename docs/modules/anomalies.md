# Modul: Anomalien

> Schicht 1 (`content/anomalies.ts`) + Schicht 2 (`game/simulation/systems/anomalySystem.ts`)
> · Status 🟢 M4 abgeschlossen

## Zweck

Anomalien sind die wichtigste Identitätsmechanik des Spiels (docs/00-VISION.md).
Sie sind der Grund, warum sich Karten verändern, warum Ausrüstung versagt und
warum die Welt sich *falsch* anfühlt statt bloß gefährlich.

Die Designregel, die alles trägt:

> Jede Anomalie ist eine andere **Art von Problem** — nicht fünf Varianten von
> „Schaden über Zeit“.

| Anomalie | Art des Problems | Wirkung |
|----------|------------------|---------|
| **Stillstand** | Bewegung | Verlangsamt alles im Radius, auch Geschosse. Der Kern verletzt. |
| **Flüstern** | Information | Kein Schaden. Minimap, Munitionsanzeige und Marker fallen aus. |
| **Rückstoß** | Timing | Pulsiert im festen Rhythmus, stößt weg und verletzt nah am Zentrum. |
| **Bleiche** | Aufmerksamkeit | Entzieht lautlos Leben. Man merkt es zu spät. |
| **Echo-Schatten** | Zweischneidiges Geschenk | Spielt vergangene Passanten nach — Gegner folgen dem, was sie hören. |

Jede von ihnen steht neben etwas, das sich zu holen lohnt. Das ist der ganze
Entwurf: **Die Belohnung liegt in dem Ding, das dich weghaben will.**

## Öffentlicher Vertrag

```ts
// content — reine Daten, keine Logik
getAnomaly(kind): AnomalyDef       // radius, coreFraction, color, avoidance, description
ANOMALY_WEIGHTS                    // gewichtete Tabelle für die Kartengenerierung

// game — Simulation
anomalySystem(ctx)                 // ein fester Schritt pro Tick
fieldFactorAt(ctx, x, y): number   // Geschwindigkeitsfaktor (Stillstand), 1 = frei
avoidanceAt(ctx, x, y): number     // 0..1, wie stark die KI die Zelle meiden soll
buildAvoidanceOverlay(ctx)         // einmalige Kostenkarte für den NavigationCache
```

Ereignisse: `anomaly:entered`, `anomaly:exited`, `anomaly:pulsed`, `anomaly:echo`.

## Determinismus

Alle Rhythmen laufen über den Simulationstick, **nie** über Wanduhrzeit
(ADR-009). Derselbe Seed erzeugt denselben Puls — was nicht nur für
Reproduzierbarkeit zählt: Ein Rückstoß ist ein Timing-Rätsel, und ein Rätsel,
dessen Takt von der Framerate abhängt, ist unfair.

Der Test in `anomalies.test.ts` prüft den Takt deshalb direkt: der Abstand
zwischen zwei Pulsen darf um weniger als 3 Ticks von `recoilPulseSeconds`
abweichen.

## Wirkung im Detail

**Stillstand** skaliert die Geschwindigkeit zum Zentrum hin auf
`ANOMALY.stillnessSlowFactor` herunter — auch die von Projektilen. Eine Kugel,
die sichtbar durch das Feld kriecht, ist das klarste Signal, das die Mechanik
geben kann. Nur der Kern verletzt.

**Flüstern** setzt `ctx.hudJammed`. Das View-Model liefert daraufhin keine
Zonen mehr, das HUD blendet die Minimap aus und schreibt „Signal gestört“ statt
eines Munitionsstands. Eine Karte, die bloß *veraltet* ist, wäre schlimmer als
gar keine — der Spieler würde ihr weiter vertrauen.

**Rückstoß** feuert alle `recoilPulseSeconds` einen Impuls: Geschwindigkeit nach
außen (die Bewegungssysteme lösen die Kollision auf, also schiebt es niemanden
durch eine Wand), Schaden mit quadratischem Abfall und ein Geräusch. Der Renderer
lässt das Feld zum Puls hin anschwellen — der Takt muss **sichtbar** sein,
sonst ist die Überquerung Glückssache statt Können.

**Bleiche** zieht Leben proportional zur Tiefe im Feld. Kein Stoß, keine
Verlangsamung, kein Ton. Die einzige Warnung ist die Optik.

**Echo-Schatten** merkt sich alle `echoSampleSeconds` die Position dessen, der
hindurchgeht, und vergisst nach `echoMemorySeconds`. Alle `echoReplaySeconds`
spielt er eine gespeicherte Position als Geräusch nach. Für den Spieler ist das
Aufklärung; für die Gegner ist es ein Grund, dorthin zu laufen. Wer wem nützt,
entscheidet sich daran, wer gerade wo steht.

## KI-Reaktion

Bis M3 liefen Gegner ungerührt durch ein Stillstand-Feld. Jetzt gibt jede
Anomaliedefinition ein `avoidance`-Gewicht vor, aus dem beim Raidstart **einmal**
eine Kostenkarte gebaut wird (`buildAvoidanceOverlay`). Der `NavigationCache`
addiert diese Kosten in jedes Flow-Field.

Das ist bewusst *Kosten* und keine Wand: Ein Gegner nimmt den Umweg, wenn es
einen gibt, und läuft trotzdem hindurch, wenn es keinen gibt. Weil Anomalien
sich nie bewegen, kostet die ganze Vorsicht zur Laufzeit nichts.

| Anomalie | `avoidance` | Warum |
|----------|-------------|-------|
| Rückstoß | 0.9 | Stößt und verletzt — der offensichtlichste Grund, außen herumzugehen |
| Bleiche | 0.85 | Tötet still, und die KI hat keinen Grund, das zu riskieren |
| Stillstand | 0.7 | Gefährlich, aber überquerbar |
| Flüstern | 0.2 | Tut ihnen nichts; sie haben keine Instrumente zu verlieren |
| Echo-Schatten | 0 | Harmlos — sie *gehen* sogar hin, wenn er sie ruft |

Ein Nebeneffekt, der dem Spieler gehört: Weil die Route der Gegner von dem
abhängt, was auf dem Boden liegt, lässt sie sich vorhersehen.

## Wetter-Kopplung

Bei `riftpulse` („Der Riss pulsiert“) skaliert jede Wirkung mit
`ANOMALY.riftPulseIntensity`. Das Wetter ist damit nicht nur Optik, sondern eine
Ansage im Briefing, die man ernst nehmen sollte.

## Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| Fünf Problemarten statt fünf Schadenszahlen | Eine Anomalie, die man nur „aushält“, ist ein Zaun. Eine, die man *löst*, ist ein Ort. |
| Puls über Tick, nicht über Zeit | Sonst hängt ein Timing-Rätsel an der Framerate (ADR-009) |
| Flüstern blendet aus statt einzufrieren | Eine stehengebliebene Minimap lügt, eine fehlende ist ehrlich |
| Wirkung trifft **jeden**, nicht nur den Spieler | Ein Gegner, der in der Bleiche stirbt, die er dem Spieler nachgejagt ist, ist eine der besseren Geschichten eines Raids |
| Avoidance als Kostenkarte, einmal gebaut | Anomalien bewegen sich nicht; pro Tick neu zu rechnen wäre reine Verschwendung |
| Farbe steht in `content`, nicht im Renderer | Eine Bleiche von einem Stillstand auf einen Blick zu unterscheiden ist Gameplay, nicht Deko (ADR-008) |

## Tests

`game/simulation/anomalies.test.ts` — je Anomalie das, was sie *anders* macht:
Stillstand verlangsamt und verletzt nur im Kern, Bleiche zieht Leben ohne ein
einziges Geräusch, Flüstern jammt das HUD ohne Schaden und gibt es beim
Verlassen wieder frei, Rückstoß pulst in gleichmäßigem Takt und schiebt,
Echo-Schatten speichert und spielt nach und verletzt dabei nie. Dazu die
Avoidance-Rangfolge (Bleiche ≫ Flüstern, außerhalb 0).

## Offen / nächster Schritt

- Audio: die fünf Felder brauchen je eine eigene Klangsignatur (M7)
- Anomalien, die auf Waffen wirken (Ladehemmung im Feld) — Kandidat für M7
- Bewegliche Anomalien; erst sinnvoll, wenn die Kostenkarte inkrementell wird
