# Module: game/weapons, game/combat

> Schicht 2 · Status 🟢 Prototyp fertig

## Zweck

`game/weapons` entscheidet **ob und wie** geschossen wird (Feuerrate, Magazin,
Streuung, Nachladen). `game/combat` entscheidet **was der Schuss bewirkt**
(Flug, Treffer, Schaden, Tod).

Die Trennung ist bewusst: Feuern und Wirkung ändern sich aus völlig
unterschiedlichen Gründen. Ein neuer Feuermodus fasst die Schadensrechnung nicht an.

## Ein Codepfad für Spieler und KI

```ts
tryFire(ctx, entity, dirX, dirY, accuracy = 1): FireResult
tryReload(ctx, entity): boolean
updateWeapons(ctx): void   // Cooldowns, Nachladen, Streuungsabbau
```

Der einzige Unterschied zwischen Spieler und Streuner ist der `accuracy`-Wert
und die Frage, ob die Entität ein Inventar besitzt:

- **mit Inventar** (Spieler): Nachladen entnimmt echte Munition; ohne Munition kein Nachladen
- **ohne Inventar** (KI): Magazin füllt sich auf; der Druck entsteht aus dem
  Nachladefenster, nicht aus Nachschubsimulation

Damit gibt es keine zwei Kampfsysteme, die auseinanderdriften können.

## Streuung

```
effektiv = (Basisstreuung + Bloom) / accuracy          [Grad]
Bloom    += spreadPerShotDeg je Schuss, gedeckelt
Bloom    -= bloomDecayDegPerSecond je Sekunde
Abweichung = gaussian(0, effektiv * 0.5)
```

**Gauß statt Gleichverteilung**: Schüsse gruppieren sich um das Fadenkreuz. Das
liest sich als „die Waffe ist genau, aber nicht perfekt" statt als „zufällig".

## Projektile

Echte Projektile, kein Hitscan — sie sind auf einem kleinen Display sichtbar,
erlauben Vorhalten und machen Anomalien lesbar (dort werden sie langsamer).

- **Substeps**: höchstens 0,35 m pro Kollisionsschritt. Bei 132 m/s würde ein
  einzelner 16-ms-Schritt 2,2 m überspringen und durch Wände tunneln.
- **Wand vor Aktor**: Eine Kugel, die eine Ecke streift, darf den Gegner
  dahinter nicht treffen.
- **Reichweiten-Falloff**: voller Schaden bis `effectiveRange`, danach linear
  bis `minDamageFactor` bei `maxRange`. Das macht die Schrotflinte zur
  Nahantwort und das Präzisionsgewehr zur Fernantwort — ohne Sonderregeln.

## Schaden

Ein einziger Einstiegspunkt: `applyDamage(ctx, target, source, amount, x, y, wasUnaware)`.

```
Schaden = roh × (unaware ? 1.5 : 1)
Nach Rüstung = max(Schaden × 0.15, Schaden × (1 − Reduktion))
```

- Rüstung reduziert nie auf null (`minDamageAfterArmor`) — sonst wären
  bestimmte Kombinationen unbesiegbar.
- **Gnadenfenster**: Sieben Schrotkugeln in einem Tick verursachen alle Schaden,
  lösen aber nur *ein* Kamerawackeln aus. Sonst wird der Bildschirm zum Stroboskop.
- Unaufmerksame Gegner nehmen 50 % mehr Schaden — Schleichen zahlt sich aus,
  ohne ein eigenes Stealth-System zu brauchen.

## Tests

`raidSimulation.test.ts` — Munitionsverbrauch, automatisches Nachladen bei
leerem Magazin, Feuerereignis mit Lärmradius, Projektile verschwinden zuverlässig
(Lebenszeit, Wand oder Treffer), keine NaN über 600 Ticks.

## Offen / nächster Schritt (M2)

- Waffenmodifikationen (Lauf, Visier, Magazin, Schalldämpfer) mit Stat-Deltas
- Munitionstypen: Penetration vs. Schaden vs. Fragmentierung
- Trefferzonen und mehrschichtige Rüstung
- Rückstoßmuster statt reiner Streuung
- Nahkampf, Wurfgeschosse, Ladehemmung, Haltbarkeit
