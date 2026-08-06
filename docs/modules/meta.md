# Modul: game/save

> Schicht 2 · Status 🟢 M5 abgeschlossen

## Zweck

Persistenz. Die übrigen Meta-Systeme haben seit M5 eigene Dokumente:

- [base.md](base.md) — Profil, Modulausbau, Bauzeiten, Questlinie
- [economy.md](economy.md) — Händler, Ruf, Aufträge, Versicherung, Abrechnung
- [crafting.md](crafting.md) — Werkbank, Zeit, Fehlschlagquote

Zusammen sind sie die Gegenkraft zur Härte des Raids — der Grund, warum sich ein
Verlust nicht wie Zeitverschwendung anfühlt (Pillar P5).

## Speichersystem

**Regel: Ein Speicherstand wird nie durch ein Update ungültig.**

```ts
deserialize(raw, now): { save, recovered, notes }   // wirft NIE
serialize(save): string
```

Drei Schutzebenen:

1. **Migrationskette** — `v0 → v1 → v2 …`, ein Schritt je Version. Neue Schritte
   kommen dazu, bestehende werden nie verändert.

   M5 hat die erste echte Migration gebracht (`v1 → v2`, die Meta-Schicht). Sie
   ist eine Zeile: Jedes neue Feld hat einen sicheren Leer-Default, den die
   Validierung ohnehin einsetzt. Ein v1-Speicherstand behält Lager, Credits,
   Statistik und Loadout vollständig und bekommt eine frische Basis dazu —
   genau das, was eine Basis ist, die diese Systeme noch nie benutzt hat.
2. **Validierung** — jedes Feld wird geprüft und repariert. Unbekannte Items
   (aus einem Patch entfernt) werden verworfen, der Rest des Profils bleibt.
3. **Fallback** — unparsbare Daten ergeben ein frisches Profil plus Hinweis.
   Ein Absturz beim Start ist der schlimmste Fehler, den ein Mobile-Spiel machen kann.

Die Simulation besitzt keine Uhr (`Date.now()` ist in `src/game/**` verboten) —
der Zeitstempel wird von außen übergeben.

## Was gespeichert wird

Das gesamte `PlayerProfile` — Lager, Loadout, Module, Statistik und seit M5 die
Meta-Warteschlangen (siehe [base.md](base.md)). Ausschließlich JSON-sichere
Daten, ohne Klasseninstanzen: eine direkte Folge davon, dass Komponenten reine
Daten sind (ADR-002).

Zeitstempel sind Epoch-Millisekunden von außen. `game/**` besitzt keine Uhr, und
`Date.now()` ist dort verboten (ADR-009) — was nebenbei dafür sorgt, dass
Bau- und Fertigungszeiten einen Neustart unbeschadet überstehen.

## Anti-Softlock

Nach jedem Raid prüft die App, ob noch eine Waffe im Lager liegt. Wenn nicht,
gibt die Basis kostenlos eine Notausrüstung aus.

Alles zu verlieren ist der Sinn des Genres. Danach nicht mehr spielen zu können,
ist es nicht.

## Validierung inhaltsabhängiger Daten

Warteschlangen verweisen auf Inhalte, die ein Patch entfernen kann. Ein Bau für
ein gelöschtes Modul wird **verworfen**, nicht repariert: Die Credits sind so
oder so weg, aber ein Phantomauftrag würde den Slot für immer blockieren.
Dasselbe gilt für Rezepte, Händler-Ruf und Aufträge.

## Tests

`saveSystem.test.ts`: Roundtrip, fehlender Speicherstand, unparsbare Daten,
unversionierter Altstand, Speicherstand aus der Zukunft, unbekannte Items,
kaputte Slot-Einträge, Loadout mit fehlenden Gegenständen, **Migration v1 → v2
ohne Verlust** und das Verwerfen von Warteschlangen-Einträgen, deren Inhalt es
nicht mehr gibt.

## Offen / nächster Schritt

- Cloud-Sync (frühestens M8, braucht Konflikt-Auflösung)
- Mehrere Speicherplätze — bewusst zurückgestellt, ein Extraction-Shooter hat
  genau ein Profil
