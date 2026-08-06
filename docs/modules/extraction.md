# Module: game/extraction, game/simulation

> Schicht 2 · Status 🟢 Prototyp fertig

## Zweck

`game/extraction` implementiert die Entscheidung, um die das Spiel gebaut ist.
`game/simulation` orchestriert alle Systeme in fester Reihenfolge.

## Die Extraktions-Mechanik

Zonen durchlaufen `locked → available → closing → closed`, gestaffelt:

```
t=0:00   alle Zonen verschlossen
t=2:00   erste Zone öffnet   (nächste am Spawn)
t=4:00   zweite Zone öffnet, erste beginnt zu blinken
t=5:00   erste Zone schließt endgültig
t=8:00   letzte Zone öffnet  (am weitesten entfernt)
t=10:00  Raid-Ende — wer draußen ist, gilt als verschollen
```

**Eine einzige Regel erzeugt das gesamte Spannungsdesign**: Die sichere,
nahe Zone schließt zuerst; die späteren liegen weiter weg. Damit ist „noch ein
Raum" jedes Mal eine echte Wette.

Die Extraktion selbst braucht 5 Sekunden Standzeit. Sie bricht ab bei:

- Verlassen der Zone
- **Treffer in den letzten 0,5 Sekunden** — fünf Sekunden im Freien müssen eine
  echte Verpflichtung sein, keine Formalität

## Die Simulation

```ts
const sim = new RaidSimulation({ seed, loadout });
sim.start();
sim.applyIntent(intent);
sim.step();          // exakt ein fester Zeitschritt
sim.snapshot();
```

Systemreihenfolge pro Tick — **Teil des Determinismus-Vertrags**:

```
storePreviousTransforms   (für die Render-Interpolation)
playerSystem              Bewegung, Ausdauer, Zielen, Feuern, Item-Nutzung, Licht
doorSystem                Türen öffnen auf Annäherung, Schlüssel prüfen
perceptionSystem          Sicht und Gehör der KI (skaliert mit dem Wetter)
aiSystem                  Verhaltens-FSM und Steering
updateWeapons             Cooldowns, Nachladen, Streuungsabbau
projectileSystem          Flug, Kollision, Schaden
deathSystem               Tod, Loot-Drops, Aufräumen
interactionSystem         Behälter und Bodenloot
anomalySystem             alle fünf Felder: Verlangsamung, Puls, Zehrung, Störung, Echo
extractionSystem          Zonenphasen und Halte-Timer
updateRaidTimer           Raid-Ende und Warnungen
flushDestroyed            verzögertes Löschen wird wirksam
```

Diese Reihenfolge darf nur bewusst und dokumentiert geändert werden.

## Raid-Ende

| Ausgang | Beute | Ausrüstung | Echo-Splitter |
|---------|-------|-----------|---------------|
| `extracted` | vollständig gesichert | behalten | im Rucksack enthalten |
| `died` | verloren | verloren | 50 % gerettet |
| `timeout` | verloren | verloren | 50 % gerettet |

Der Tod hat ein Verzögerungsfenster von 48 Ticks (0,8 s), damit der Renderer den
Todesmoment spielen kann, bevor der Ergebnisbildschirm übernimmt.

Dass Echo-Splitter den Tod teilweise überstehen, ist Absicht (Pillar P5): Auch
ein gescheiterter Raid bewegt die Meta-Progression.

## Tests

`raidSimulation.test.ts` (12 Tests): 600-Tick-Smoke ohne NaN, identische
Ereignis-Traces bei gleichem Seed, Divergenz bei unterschiedlichem Seed,
Spieler betritt nie eine Wand, Überladung verlangsamt messbar, Munitionsverbrauch
und Nachladen, Zeitablauf, vollständige Extraktion mit Ausgang und XP,
Tod mit geretteten Splittern, Behältersuche und Aufnahme.

## Offen / nächster Schritt

- **M3/M4**: Extraktionen mit Bedingungen (Gegenstand dabei, Gebühr, nur ohne
  Rucksack) — im Genre ein starker Spannungsverstärker
- **M6**: Wiederaufnahme eines laufenden Raids nach App-Neustart (das
  Save-Schema sieht den Slot bereits vor)
