# Module: game/save, game/base, game/economy, game/crafting

> Schicht 2 · Status 🟡 Grundgerüst (Vertiefung in M5)

## Zweck

Alles zwischen den Raids: Profil, Lager, Händler, Basisausbau, Crafting,
Persistenz. Das ist die Gegenkraft zur Härte des Raids — der Grund, warum sich
ein Verlust nicht wie Zeitverschwendung anfühlt (Pillar P5).

## Speichersystem

**Regel: Ein Speicherstand wird nie durch ein Update ungültig.**

```ts
deserialize(raw, now): { save, recovered, notes }   // wirft NIE
serialize(save): string
```

Drei Schutzebenen:

1. **Migrationskette** — `v0 → v1 → v2 …`, ein Schritt je Version. Neue Schritte
   kommen dazu, bestehende werden nie verändert.
2. **Validierung** — jedes Feld wird geprüft und repariert. Unbekannte Items
   (aus einem Patch entfernt) werden verworfen, der Rest des Profils bleibt.
3. **Fallback** — unparsbare Daten ergeben ein frisches Profil plus Hinweis.
   Ein Absturz beim Start ist der schlimmste Fehler, den ein Mobile-Spiel machen kann.

Die Simulation besitzt keine Uhr (`Date.now()` ist in `src/game/**` verboten) —
der Zeitstempel wird von außen übergeben.

## Profil

```ts
interface PlayerProfile {
  credits, xp, level, echoShards,
  stash: InventoryState,      // überlebt jeden Tod
  loadout: Loadout,           // was in den nächsten Raid geht
  modules: Record<string, number>,
  stats: RaidStats,
}
```

XP-Kurve: `base × level^1.35`, kumulativ. Level ergibt sich immer aus XP, ist
also nie inkonsistent.

## Ökonomie

**Die Ausrüstung verlässt das Lager beim Betreten des Risses**, nicht erst beim
Tod (`commitLoadout`). Damit ist das Risiko unmissverständlich: Ab diesem Moment
ist das Zeug weg aus dem Bestand. `commitLoadout` prüft erst alles und entfernt
dann — ein Teil-Commit würde still Gegenstände vernichten.

| Regel | Wert |
|-------|------|
| Ankauf durch den Händler | 55 % des Wertes, +8 %/Händlerstufe |
| Verkauf an den Spieler | 135 % des Wertes, −7 %/Händlerstufe |

Ein Test erzwingt, dass Kaufpreis > Verkaufspreis bleibt — sonst wäre der
Händler eine Gelddruckmaschine.

`settleRaid` meldet **Overflow** statt Beute still zu verschlucken: Was nicht
mehr ins Lager passt, wird im Ergebnisbildschirm aufgeführt.

## Anti-Softlock

Nach jedem Raid prüft die App, ob noch eine Waffe im Lager liegt. Wenn nicht,
gibt die Basis kostenlos eine Notausrüstung aus.

Alles zu verlieren ist der Sinn des Genres. Danach nicht mehr spielen zu können,
ist es nicht.

## Crafting

Rezepte sind an Basismodul und -stufe gebunden. `craft` prüft *zuerst*, ob das
Ergebnis ins Lager passt, und verbraucht erst dann Material — ein volles Lager
darf keine Rohstoffe vernichten.

## Tests

`saveSystem.test.ts`: Roundtrip, fehlender Speicherstand, unparsbare Daten,
unversionierter Altstand, Speicherstand aus der Zukunft, unbekannte Items,
kaputte Slot-Einträge, Loadout mit fehlenden Gegenständen.

`trader.test.ts`: Kaufen/Verkaufen, Preisrichtung, Loadout-Commit (inkl.
fehlschlagen ohne Schaden), Abrechnung mit Overflow, Tod mit geretteten
Splittern, XP-Kurve, Modul-Ausbau, Crafting mit Modulsperre.

## Offen / nächster Schritt (M5)

- Bauzeiten und Modulabhängigkeiten
- Händler-Tiers, Ruf, dynamische Preise, Aufträge
- Schwarzmarkt
- Versicherung und sicherer Container
- Questlinie „Kartographie der Risse"
