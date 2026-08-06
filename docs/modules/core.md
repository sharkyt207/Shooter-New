# Modul: core

> Schicht 0 · Status 🟢 fertig

## Zweck

Das Fundament: Entitäten, Mathematik, Zufall, Ereignisse, Zeit.

**Ausdrücklich nicht zuständig für** Spielbegriffe. In `core/` kommt weder
„Waffe" noch „Loot" noch „Raid" vor. Wer hier ein Spielwort schreibt, hat es im
falschen Ordner.

## Öffentlicher Vertrag

### `core/ecs`

```ts
class World {
  protected registerStore<T>(name: string): ComponentStore<T>;
  createEntity(): EntityId;
  destroyEntity(entity: EntityId): void;   // markiert nur
  flushDestroyed(): number;                // entfernt wirklich
  isAlive(entity: EntityId): boolean;
}
```

**Verzögertes Löschen** ist die zentrale Eigenschaft: `destroyEntity` markiert
nur, entfernt wird am definierten Punkt im Tick. Damit kann kein System über
eine Entität stolpern, die mitten in seiner Iteration verschwunden ist.

**Generation-Handles**: Eine `EntityId` enthält `[Generation: 12 Bit | Index: 20 Bit]`.
Wird ein Index recycelt, steigt seine Generation — alte Referenzen werden
dadurch *erkennbar* ungültig statt still auf eine fremde Entität zu zeigen.

### `core/math`

| Datei | Inhalt |
|-------|--------|
| `vec2.ts` | Vektoren als `{x, y}` (JSON-fähig), Operationen mit `out`-Ziel |
| `scalar.ts` | `clamp`, `lerp`, `remap`, `approachAngle`, `damp` (frameratenunabhängig) |
| `shapes.ts` | `circleVsAabb`, `segmentVsAabb`, `isInCone` |
| `random.ts` | `SeededRandom` (mulberry32), `RandomStreams`, `seedSignature` |

`RandomStreams` ist der Kern von ADR-009: fünf unabhängige Generatoren
(`map`, `loot`, `ai`, `combat`, `misc`) aus einem Raid-Seed. Eine Änderung an
Kampfwürfen kann dadurch die Kartengenerierung nicht verschieben.

### `core/events`

```ts
const bus = new EventBus<GameEvents>();
bus.on('damage:dealt', handler);
bus.emit('damage:dealt', payload);
```

Synchron und typisiert. Der Bus iteriert über eine Kopie der Handler-Liste, ein
Handler darf sich also während der Zustellung selbst abmelden.

### `core/time`

`FixedClock` mit 60 Hz, Interpolations-`alpha` und Aufhol-Deckel von 5 Ticks.
Frame-Deltas über 250 ms werden verworfen — die App war suspendiert, nicht langsam.

## Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| Eigenes ECS statt Framework | ≤ 300 Entitäten brauchen keine Archetyp-Optimierung; volle Kontrolle über die Iterationsreihenfolge ist für Determinismus zwingend (ADR-003) |
| `Map`-basierte Component-Stores | Stabile Einfügereihenfolge = deterministische Iteration, triviale Serialisierung |
| Vektoren als Plain Objects | Überleben `JSON.stringify`, passen ins Save-System |
| `out`-Parameter statt Rückgabewerten | Allokationsfreie Hot-Loops (Performance-Budget §8) |

## Tests

`core/math/math.test.ts`, `core/math/random.test.ts`, `core/ecs/ecs.test.ts`

Abgesichert: Determinismus gleicher Seeds, Unabhängigkeit der Streams,
Gewichtungsverteilung, Wiederherstellung eines Streams aus dem Save-Zustand,
Winkel-Kurzweg, framerate-unabhängiges Dämpfen, Kreis/AABB-Auswurf auch bei
Mittelpunkt *innerhalb* der Box, Ungültigwerden recycelter Entity-Handles,
verzögertes Löschen.

## Offen / nächster Schritt

- `ObjectPool` wird im Prototyp noch nicht für Projektile genutzt — kommt beim
  Performance-Pass in M6.
- Ein `SpatialHash` wird erst nötig, wenn die Entitätenzahl über ~500 steigt.
