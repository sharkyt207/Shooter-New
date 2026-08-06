# Modul: game/economy

> Schicht 2 · Status 🟢 M5 abgeschlossen

## Zweck

Handel, Ruf, Aufträge, Versicherung und die Abrechnung nach dem Raid. Hier wird
aus Beute Fortschritt — und aus einem verlorenen Raid etwas, das man übersteht.

## Die eine Invariante

> **Kein Händler kauft je teurer, als er verkauft.**

Kippt das, hat das Spiel eine Gelddruckmaschine und jede andere Zahl hört auf,
eine Bedeutung zu haben. `economy.test.ts` prüft die Preisrichtung für **jeden**
Händler, **jede** Ruf-Stufe und **jede** Händler-Modulstufe.

Der Test hat sich sofort bezahlt gemacht: Der Kategorie-Aufschlag der Feldärztin
(1,75× auf Medizin) galt zunächst nur beim Ankauf. Bei hohem Ruf zahlte sie
damit 51 für einen Verband, den sie für 48 verkaufte. Der Aufschlag gilt jetzt
auf **beiden** Seiten — was auch inhaltlich stimmiger ist: Wer über Wert kauft,
verkauft nicht unter Wert.

## Drei Händler mit Meinungen

| Händler | Braucht | Kauft | Verkauft | Besonderheit |
|---------|---------|-------|----------|--------------|
| Quartiermeister | Händler 1 | alles | Standard | Aufschlag auf Material und Munition |
| Feldärztin | Händler 2 | keine Waffen, Anbauteile, Wurfwaffen | günstig | 1,75× auf Medizin |
| Schwarzmarkt | Schwarzmarkt 1 | alles, hoch | teuer | Aufschlag auf Wertsachen und Schlüssel |

Ein einzelner Laden mit einem Kurs macht aus Beute einen undifferenzierten
Haufen Credits. Drei Käufer mit Meinungen machen aus demselben Haufen eine
Frage: *Wer* will das, und was gibt er dafür?

## Ruf

Ruf entsteht durch **Geschäfte** — jeder gehandelte Credit zählt, in beide
Richtungen, und Aufträge zählen viel. Das ist der Entwurf in einem Satz: Der Weg
zur besseren Waffe führt über einen Händler, den man benutzt hat, nicht über
einen Geldstapel von woanders.

Er kauft genau zwei Dinge, und bewusst nur diese zwei:

1. **Bessere Preise** (`sellBonusPerTier`, `buyDiscountPerTier`)
2. **Tieferes Sortiment** — gesperrte Ware wird ausgegraut *angezeigt*, damit
   die nächste Stufe einen sichtbaren Zweck hat.

Ruf ist pro Händler, nicht geteilt.

## Aufträge

Drei Angebote, alle acht Stunden neu gewürfelt. Der Wurf ist deterministisch aus
Profil-Seed und Fenster-Index, deshalb überstehen die Angebote einen Neustart
unverändert — und lassen sich nicht durch Neuladen nach einem besseren Satz
absuchen.

Abgabe nimmt Gegenstände direkt aus dem Lager und zahlt Credits, XP und Ruf.
**Nichts läuft ab, während der Spieler weg ist.** Ein Countdown in einem
Mobile-Spiel ist eine Art, Leute dafür zu bestrafen, ein Leben zu haben
(docs/08-UI-UX.md).

## Versicherung

Prämie vor dem Raid; geht der Raid schief, findet ein Teil der getragenen
Ausrüstung nach einer Weile zurück in die Basis.

Drei bewusste Grenzen halten sie davon ab, das Genre auszuhebeln:

1. **Nicht sicher** — `insuranceReturnChance` liegt deutlich unter 1. Ein Raid,
   den man nicht verlieren kann, hat keine Spannung mehr (Pillar P1).
2. **Nicht sofort** — die Rückgabe dauert lange genug, dass der nächste Raid mit
   etwas anderem gelaufen werden muss.
3. **Nur Getragenes** — Beute ist nie versichert. Was man *riskiert* hat, kann
   zurückkommen; was man *gewonnen* hat, nicht.

Die Prämie wird im selben Moment abgebucht, in dem die Ausrüstung das Lager
verlässt (`commitLoadout`) — Versichern ist Teil derselben Entscheidung wie die
Frage, was man überhaupt mitnimmt. Der Schutz erlischt mit dem Raid, für den er
gekauft wurde.

## Sicherer Behälter

Ein kleiner Behälter, dessen Inhalt **jeden** Ausgang übersteht — auch den Tod,
auch das Aufgeben. Er ist absichtlich winzig (2,5 kg): Ein Behälter, der eine
ganze Raid-Beute schluckt, löscht genau die Entscheidung, für die er existiert.

Im Raid ist er eine eigene `InventoryState` neben dem Rucksack, damit Gewicht,
Kapazität und „passt das noch rein" exakt so funktionieren wie sonst auch. Die
Schaltfläche **Sichern** im Inventar ist damit die folgenreichste Taste des
Spiels: Sie entscheidet, was einen Tod überlebt.

## Abrechnung

`settleRaid(profile, outcome, now)` — die Reihenfolge *ist* die Form des
Meta-Loops:

```
1. Sicherer Behälter ins Lager      (bei jedem Ausgang)
2. Beute ins Lager                  (nur bei Extraktion)
3. Versicherung anmelden            (nur bei Tod/Zeitablauf, nur Getragenes)
4. Questlinie informieren
5. XP gutschreiben
```

Zuletzt XP, damit ein Levelaufstieg nie vor dem Grund für ihn angezeigt wird.
Overflow wird **gemeldet**, nie stillschweigend verschluckt.

## Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| Kategorie-Aufschlag auf beiden Seiten | Symmetrie schließt die Gelddruckmaschine und ist inhaltlich stimmiger |
| Preisrichtung als Test über alle Kombinationen | Genau dort steckte der Fehler, den niemand von Hand gefunden hätte |
| Ruf durch Handelsvolumen statt durch Level | Der Weg zur besseren Ware führt über den Händler selbst |
| Gesperrtes Sortiment sichtbar lassen | Eine Stufe ohne sichtbares Ziel motiviert nicht |
| Aufträge deterministisch pro Zeitfenster | Kein Neuladen bis der Auftrag passt |
| Aufträge laufen nie ab | Zeitdruck außerhalb des Raids ist Bestrafung, keine Spannung |
| Versicherung nur auf Getragenes | Beute muss verlierbar bleiben, sonst verschwindet das Risiko |
| Prämie beim Betreten, nicht beim Tod | Dieselbe Entscheidung wie „was riskiere ich" |
| Sicherer Behälter als eigene Inventory | Gewicht und Kapazität funktionieren ohne Sonderfall |

## Tests

`game/economy/economy.test.ts` — Preisrichtung über alle Händler/Stufen/Rufwerte,
Kategorie-Aufschläge, verweigerte Kategorien (ohne dass etwas verschwindet),
gesperrte Händler, Ruf pro Händler und seine Preiswirkung, Auftragswurf stabil
im Fenster und neu danach, Abgabe genau einmal, Versicherung (Verfügbarkeit,
Prämienhöhe, Modulrabatt, verzögerte Rückgabe, niemals Beute), sicherer Behälter
über Tod hinweg, und dass ein volles Lager nie Credits frisst.

`game/economy/trader.test.ts` — die M1-Grundlagen, weiterhin gültig.

## Offen / nächster Schritt

- Preisdrift über die Zeit (Angebot/Nachfrage) — Kandidat für M8 mit Telemetrie
- Aufträge mit Ortsbezug („aus diesem Fragment") sobald Fragmente Namen tragen
