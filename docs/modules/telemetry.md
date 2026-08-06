# Modul: Telemetrie & Balance-Overlay

> Schicht 1 (`content/balanceOverlay`) + Schicht 2 (`game/telemetry`) +
> Schicht 3 (`platform/config`) · Status 🟢 M8 Teil 1

## Zweck

Zwei Fragen beantworten, die ein Spiel nach dem Launch stellt:

1. **Wie läuft es eigentlich?** — Ausgangsverteilung, Todesursachen,
   Wirtschaftsdrift, Verlustserien.
2. **Kann ich das korrigieren, ohne ein App-Update?** — ja, für Zahlen.

Ausdrücklich **nicht** zuständig für: Datenerhebung. Es gibt keinen Endpunkt,
keine Kennung, keinen Versand.

## Die Telemetrie bleibt auf dem Gerät

Der übliche Weg wäre ein Analyse-Dienst. Der Preis dafür wäre nicht technisch,
sondern rechtlich: Die Datenschutzangaben bei Apple und Google springen von
„keine Daten" auf eine Liste, es braucht eine Datenschutzerklärung mit
Auftragsverarbeiter, unter Umständen ein Einwilligungsbanner — und das alles
für ein Einzelspielerspiel ohne Konto.

Der Nutzen wäre außerdem geringer als er klingt: Aggregierte Ausgangsquoten von
tausend Spielern sagen dasselbe wie die von einem, der oft spielt, solange man
sie *lesen* kann. Also werden sie lesbar gemacht — auf einem Bildschirm im Spiel
(ADR-017).

```
Hauptmenü → Diagnose
```

Der Bildschirm ist absichtlich **nicht** hinter einem Debug-Schalter. Er zeigt,
was gespeichert ist, sagt in einem Satz, dass nichts das Gerät verlässt, und
bietet eine Löschtaste. Das ist eine überprüfbare Datenschutzerklärung statt
einer behaupteten.

| Was | Warum es aufgezeichnet wird |
|-----|------------------------------|
| Ausgang, Dauer, Abschüsse | Ist die Raid-Länge richtig? Ist Sterben zu häufig? |
| Beutewert + Sicherer Behälter | Wirtschaftsdrift; der Behälter macht einen Tod ungleich null |
| Erlittener Schaden, Treffer je Schuss | Trifft überhaupt jemand? |
| Todesursache | Die wertvollste Einzelzahl — siehe unten |
| Boss angetroffen | Ist die 35-%-Chance in der Praxis 35 %? |
| Längste Verlustserie | Der einzige Wert über *Gefühl*: Mittelwerte verstecken sechs Niederlagen am Stück |
| Balance-Version | Welche Zahlen diesen Raid erzeugt haben |

Fünfzig Raids im Ringpuffer. Nicht mehr, weil ein Mittelwert über eine Version
des Spiels, die es nicht mehr gibt, in die Irre führt — und weil eine
Speicherdatei nicht unbegrenzt wachsen darf.

**Kein Zeitstempel, keine Position, keine Entity-ID.** Ein Datensatz soll für
niemanden außer der Balance-Tabelle etwas bedeuten.

## Die Todesursache musste erfunden werden

Sie war nicht rekonstruierbar. `entity:died` sagt *dass*, `damage:dealt` sagte
*wieviel*, aber nicht *wodurch*. Aus Position und Zeitpunkt zu erraten, ob eine
Anomalie oder ein Schuss den Ausschlag gab, wäre Kaffeesatz gewesen.

Also trägt `damage:dealt` jetzt eine `cause`, und `DamageOptions.cause` ist
**pflichtig**. Das ist Reibung an sechs Aufrufstellen und der Punkt daran: Eine
neue Schadensquelle muss sagen, was sie ist, sonst wächst im Diagramm still ein
Balken „Beschuss", der nie Beschuss war.

Vier Kategorien, bewusst grob. „40 % Tode durch Anomalien" ändert eine Zahl in
`balance.ts`. „Tod durch Anomalie Bleiche bei 14,2 m" ändert nichts.

## Der Aufzeichner ist ein reiner Ereignis-Konsument

```ts
const recorder = createRaidRecorder(sim.bus, seed, balanceVersion(), player);
// ... Raid ...
telemetry = recordRaid(telemetry, recorder.finish(outcome));
```

Er liest keine Uhr und keinen Speicher — beides gehört `app/` (ADR-002).
Deshalb testet man ihn, indem man eine Handvoll Ereignisse auf einen Bus wirft,
und genau das tut `telemetry.test.ts`.

`summarise()` ist rein. Der Bildschirm rechnet nichts außer einer Prozentzahl,
also können Anzeige und Test sich nicht darüber uneinig werden, was eine Zahl
bedeutet.

### „Treffer je Schuss", nicht „Trefferquote"

Eine Schrotladung sind sieben Schrotkugeln und damit bis zu sieben
Schadensereignisse pro Abzug. Eine Quote wäre dort größer als 1 gewesen und
hätte als Fehler ausgesehen. Der Wert heißt jetzt, was er ist.

## Das Balance-Overlay

`balance.ts` bleibt die einzige Quelle der Zahlen (ADR-010). Ein geprüfter Patch
legt sich beim Start darüber (ADR-018).

```json
{
  "version": "2026.2",
  "PLAYER": { "baseSpeed": 4.5 },
  "RAID":   { "durationSeconds": 900 }
}
```

Drei Regeln machen das sicher statt leichtsinnig:

| Regel | Warum |
|-------|-------|
| Nur vorhandene Gruppen und Schlüssel | Ein Tippfehler kann keine Konstante erfinden, die niemand liest |
| Höchstens Faktor 5 vom Vorgabewert, Vorzeichen bleibt | `maxHealth: 0` ist keine Balance-Änderung, das ist ein Ausfall |
| Nur beim Start, nie im laufenden Raid | Die Simulation ist je Seed deterministisch (ADR-009) |

Nicht-Zahlen (`MAP.prefabsPerFragment`, `META.reputationTiers`) werden
abgelehnt: Struktur zu ändern ist eine Codeänderung.

Ein Patch mit einem schlechten Schlüssel liefert die anderen trotzdem. Der
Bericht sagt genau, was verworfen wurde und warum, und diese Meldungen sind
`warn` — sie überleben damit den Produktions-Loglevel. Eine Konfiguration, die
der Server für ausgerollt hält und das Spiel stillschweigend ignoriert, ist der
Fehlerfall, bei dem man laut sein will.

### Die Falle, in die dieser Mechanismus fällt

Ein Overlay **mutiert** die Objekte in `balance.ts`. Jedes Modul, das sich beim
Laden eine Kopie zieht, behält für immer den alten Wert:

```ts
const INSURANCE_CHANCE = META.insuranceReturnChance;  // ← unsichtbar kaputt
```

Der Patch wirkt dann überall außer an dieser einen Stelle — der schlimmste
Fehlertyp, weil die Konfiguration nachweislich stimmt. `loadoutScreen.ts` machte
genau das. Ein Test durchsucht jetzt den gesamten Quelltext nach diesem Muster.

## Der Netzwerkpfad ist standardmäßig nicht vorhanden

`VITE_BALANCE_CONFIG_URL` ist die einzige Möglichkeit, ihn einzuschalten. Es gibt
keine Vorgabe-URL: Ein Build, den niemand absichtlich auf einen Konfigurationsserver
gerichtet hat, redet mit niemandem. Diese Aussage muss durch Lesen einer Datei
überprüfbar sein, weil beide Stores danach fragen (`docs/11-COMPLIANCE.md`).

Auch eingeschaltet wird nichts *gesendet*: GET, `credentials: 'omit'`, kein
Körper. Jeder Fehlerpfad — offline, Zeitüberschreitung, 404, kaputtes JSON, zu
groß — endet in `null`, und `null` heißt „mit den ausgelieferten Zahlen spielen".
Ein Konfigurationsserver darf niemals der Grund sein, warum jemand keinen Raid
starten kann. 2,5 s Zeitlimit, 64 kB Höchstgröße.

## Tests

| Test | Findet |
|------|--------|
| `telemetry.test.ts` (29) | Zählfehler, falsche Todesursache, Ringpuffer, kaputte Speicherstände |
| `balanceOverlay.test.ts` (25) | Jede Ablehnungsregel, Teilanwendung, Rücksetzen, **Ladezeit-Kopien im Quelltext** |
| `remoteConfig.test.ts` (8) | Dass jeder Fehlerpfad `null` liefert und nie Anmeldedaten mitgehen |
| Browser | Diagnose-Bildschirm in beiden Sprachen, leer und gefüllt; ein echter Patch aus einer echten HTTP-Antwort |

Der Browser-Durchlauf hat sich gelohnt: „1 Raids" stand da, weil ein Plural als
Suffix im Code klebte statt als eigene Quellzeichenkette. Kein Unit-Test der Welt
hätte das gefunden.

## Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| Telemetrie bleibt lokal | Die Datenschutzangaben bleiben leer; der Nutzen bleibt fast derselbe (ADR-017) |
| Diagnose-Bildschirm ist sichtbar, nicht versteckt | Überprüfbarer Datenschutz statt behauptetem |
| Telemetrie außerhalb des Profils | Ein Profil-Reset ist der Moment, in dem die Historie am interessantesten ist |
| `cause` ist pflichtig | Sonst wächst still eine falsche Kategorie |
| Faktor 5 als Grenze | Weit genug für jede Balance-Entscheidung, eng genug gegen einen Ausfall |
| Overlay nur beim Start | Sonst ist ein Raid nicht mehr aus seinem Seed reproduzierbar |
| Keine Vorgabe-URL | „Macht die App Netzwerkanfragen" muss durch Lesen beantwortbar sein |

## Offen / nächster Schritt

- Ein Konfigurationsserver (eine statische Datei hinter einem CDN reicht)
- Segmentierung nach Waffenklasse, falls „Treffer je Schuss" je unklar wird
- Export der Aufzeichnung als Datei, falls jemand sie außerhalb auswerten will —
  bewusst noch nicht gebaut, weil ein Export der erste Schritt zum Versand ist
