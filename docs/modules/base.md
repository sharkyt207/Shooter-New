# Modul: game/base

> Schicht 2 · Status 🟢 M5 abgeschlossen

## Zweck

Die Einsatzbasis: Profil, Modulausbau, Bauwarteschlange und die Questlinie.
Das ist die Gegenkraft zur Härte des Raids — der Grund, warum ein Verlust sich
nicht wie Zeitverschwendung anfühlt (Pillar P5).

## Öffentlicher Vertrag

```ts
// Profil
createDefaultProfile(): PlayerProfile
moduleLevel(profile, moduleId): number
addXp(profile, amount): boolean          // true bei Levelaufstieg
nextMetaRandom(profile): number          // 0..1, Zähler rückt weiter

// Bauwarteschlange - alles nimmt `now` (Epoch ms) entgegen
startUpgrade(profile, moduleId, now): StartBuildResult
collectBuilds(profile, now): CompletedBuild[]
buildProgress(job, now): number          // 0..1
unmetRequirements(profile, level): { moduleId, level, name }[]

// Questlinie
advanceQuest(profile, signal, now): QuestCompletion[]
currentStage(profile) · stageProgress(profile) · questFinished(profile)
```

## Bauzeiten

Ein Ausbau wird **sofort bezahlt** und **später fertig**. Beides ist Absicht:

- Sofort bezahlen, weil ein Bau, aus dem man kostenlos wieder aussteigt, keine
  Entscheidung ist — und eine Rückerstattung die Warteschlange zum Sparkonto
  machen würde.
- Später fertig, weil die Wartezeit den Spieler **in den Riss schickt**: Die Uhr
  läuft während des Raids weiter. Ein Raid dauert zehn Minuten, also ist ein Bau
  von fünfzehn genau ein Raid Wartezeit.

Nichts dauert länger als eine Stunde, und nichts lässt sich mit Geld
beschleunigen. Ein Timer, der einen Abend überlebt, ist ein Grund aufzuhören.

Die gesamte Warteschlange besteht aus Epoch-Zeitstempeln statt aus
Countdown-Zählern. Damit übersteht sie einen Speicherstand, einen Neustart und
eine Woche Pause ohne jede Buchführung — und `game/**` braucht weiterhin keine
eigene Uhr (ADR-009), weil `now` immer hereingereicht wird.

## Modulabhängigkeiten

| Modul | Braucht | Warum |
|-------|---------|-------|
| Waffenwerkstatt | Werkbank Stufe 2 | Man baut keine Waffen auf einem Klapptisch |
| Schwarzmarkt | Händler Stufe 3 | Der Kontakt kommt über den Händler, nicht über Geld |
| Forschung | Werkbank Stufe 2 | Analyse braucht Werkzeug |

Fehlende Voraussetzungen werden **benannt**, nicht bloß als „gesperrt"
angezeigt. Ein Fortschrittsbildschirm, der einen Weg versperrt ohne zu sagen
welchen, ist das Frustrierendste, was ein Menü tun kann.

## Questlinie „Kartographie der Risse"

Es gibt genau eine, und sie ist weniger Geschichte als Lehrplan: Jede Stufe
zeigt auf das System, das das Spiel gerade freigeschaltet hat, in der
Reihenfolge, in der ein neuer Spieler ihm begegnet.

```
lebend rauskommen → kämpfen → Wert heimbringen → Tresor öffnen
→ Anomalie überstehen → selbst herstellen → Basis ausbauen
```

Das Spiel erklärt sich bewusst nicht in Menüs (docs/08-UI-UX.md). Die
Questlinie ist der Ort, an dem „das kannst du tun" *einmal* ausgesprochen wird.

Jedes Ziel wird von einer Tatsache gespeist, die der Raid ohnehin meldet
(`RaidOutcome`), deshalb musste **kein einziges System** einen Haken für die
Questlinie wachsen lassen. Eine Stufe hinzuzufügen ist eine Inhaltsänderung.

`moduleLevel` ist das einzige zustandsbasierte Ziel — es kann bereits erfüllt
sein, wenn die vorige Stufe abgeschlossen wird. Genau deshalb ist
`advanceQuest` eine Schleife und gibt ein *Array* von Abschlüssen zurück.

## Datenmodell

```ts
interface PlayerProfile {
  credits, xp, level, echoShards,
  stash, loadout, modules, weaponRepairs, stats,   // bis M4

  metaSeed: number,                 // Zähler für jeden Meta-Zufall
  builds: BuildJob[],               // { moduleId, targetLevel, readyAt }
  crafts: CraftJob[],               // { id, recipeId, readyAt, failed }
  nextCraftId: number,
  reputation: Record<string, number>,
  contracts: ActiveContract[],
  contractsRolledAt: number,
  insuranceReturns: InsuranceReturn[],
  quest: { stage, progress },
}
```

## Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| Credits vor dem Bau, nicht danach | Ein kostenlos abbrechbarer Bau ist keine Entscheidung |
| Bauzeit läuft während des Raids weiter | Der Timer soll ins Spiel schicken, nicht aus ihm heraus |
| Epoch-Zeitstempel statt Countdown | Übersteht Speichern, Neustart und Wochen Pause ohne Buchführung |
| Abhängigkeiten werden benannt | „Gesperrt" ohne Grund ist die frustrierendste Form von Fortschritt |
| Eine Questlinie, kein Questlog | Sieben Stufen, die etwas beibringen, schlagen fünfzig, die beschäftigen |
| Questziele nur aus `RaidOutcome` | Kein anderes System musste dafür angefasst werden |
| `metaSeed` im Profil, Zähler rückt vor | Sonst ließe sich jedes Meta-Ergebnis durch Neuladen neu würfeln |

## Tests

`game/base/metaProgression.test.ts` — Bauen kostet sofort und wirkt später,
Fortschritt und Restzeit stimmen, dasselbe Modul lässt sich nicht doppelt bauen,
Abhängigkeiten greifen und benennen was fehlt; Crafting-Warteschlange,
Fehlschlagquote und Slot-Grenze; Questlinie rückt nur auf das passende Signal
vor, zahlt jede abgeschlossene Stufe aus und bleibt am Ende stehen.

## Offen / nächster Schritt

- Basis-Ansicht als Raum statt als Liste (M7, mit finalen Assets)
- Modul-spezifische Boni im Raid (Medizin-Startbonus ist vorbereitet, aber noch
  nicht verdrahtet)
