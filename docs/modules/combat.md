# Module: game/weapons, game/combat

> Schicht 2 · Status 🟢 M2 abgeschlossen

## Zweck

`game/weapons` entscheidet **ob und wie** geschossen wird (Feuerrate, Magazin,
Streuung, Nachladen, Verschleiß). `game/combat` entscheidet **was der Schuss
bewirkt** (Flug, Trefferzone, Durchschlag, Schaden, Tod).

Die Trennung ist bewusst: Feuern und Wirkung ändern sich aus völlig
unterschiedlichen Gründen. Ein neuer Feuermodus fasst die Schadensrechnung nicht an.

---

## Der Leitgedanke von M2

> **Ein Schuss ist keine Zahl mehr.**

Vor M2 war Schaden `Basiswert × Rüstungsfaktor`. Jetzt hängt er ab von:
was geladen ist, was der Gegner trägt, wo es trifft, was montiert ist und wie
abgenutzt die Waffe ist. Jeder dieser Faktoren ist eine Entscheidung, die der
Spieler **vor** dem Raid getroffen hat.

---

## 1. Aufgelöste Waffenwerte (`weaponStats.ts`)

```ts
resolveWeapon(weaponId, attachments, loadedAmmoItemId, durabilityFraction): ResolvedWeapon
```

Feste Reihenfolge:

```
1. Basisdefinition
2. Aufsätze (multiplikativ und additiv)
3. Munition (Schaden, Durchschlag, Geschwindigkeit, Projektilzahl, Streuung)
4. Verschleiß (Streuung steigt, Ladehemmung wird möglich)
```

Der Feuercode kennt keine Aufsätze — er fragt nur nach Zahlen. Das ist die
gesamte Kopplung zwischen Modding und Ballistik.

**Bewusst nicht gecacht:** Alle Eingaben (Aufsätze, geladene Patrone,
Haltbarkeit) ändern sich während eines Raids. Ein veralteter Cache wäre hier
eine besonders unangenehme Fehlerklasse.

Robustheit: Ein Aufsatz im falschen Slot, an einer unpassenden Waffe oder mit
unbekannter ID wird **still ignoriert**. Speicherstände überleben
Content-Änderungen (siehe `saveSystem`).

---

## 2. Munition

Ein Kaliber, mehrere Ladungen. Die Waffe deklariert `caliber`, jedes
Munitions-Item deklariert seine Werte:

| Ladung | Schaden | Durchschlag | Splitter | Rolle |
|--------|---------|-------------|----------|-------|
| 9 mm Kern | ×1,00 | 18 | 15 % | Allzweck |
| 9 mm Stahlkern | ×0,82 | 38 | – | gegen Rüstung |
| 9 mm Splitterkern | ×1,25 | 8 | 55 % | gegen Ungepanzerte |
| 7,4 Riss | ×1,00 | 40 | 20 % | Allzweck (Präzision) |
| 7,4 Durchschlag | ×0,90 | 62 | – | gegen Plattenträger |
| 12er Streu | ×1,00 | 10 | 30 % | 7 Projektile |
| 12er Vollgeschoss | ×5,20 | 34 | 10 % | **1** Projektil, ¼ Streuung |

Das Vollgeschoss ist das deutlichste Beispiel: Es macht aus der Schrotwaffe eine
Mittelstreckenwaffe — allein über Daten, ohne eine Zeile Sonderlogik.

**Nachladen** wählt automatisch: bleibt bei der geladenen Sorte, solange Vorrat
da ist, sonst die durchschlagsstärkste verfügbare. Ein Wechsel der Sorte
**verwirft das Restmagazin** — das ist der Preis für einen Sinneswandel.
Die bewusste Wahl passiert im Ausrüstungsbildschirm, nicht mitten im Gefecht
(Pillar P4).

---

## 3. Trefferzonen (`ballistics.ts`)

Isometrische Draufsicht erlaubt kein gezieltes Kopfschießen. Zonen werden
deshalb **gewichtet gewürfelt**, und das Gewicht kommt von der Waffe:

| Waffe | Kopf | Torso | Gliedmaßen |
|-------|------|-------|------------|
| Splitter VK-2 (MP) | 6 | 62 | 32 |
| Nadel PR-9 (Präzision) | 14 | 62 | 24 |
| Bruch SG-40 (Schrot) | 4 | 58 | 38 |

Multiplikatoren: Kopf ×2,6 · Torso ×1,0 · Gliedmaßen ×0,72.
Ein **unaufmerksames** Ziel bekommt zusätzliches Kopfgewicht — deshalb lohnt
der erste Schuss aus der Deckung.

Das ist ehrlicher als eine vorgetäuschte Präzision, die die Kamera nicht
hergibt, und behält die Genre-Spannung „ein guter Treffer beendet es".

---

## 4. Durchschlag gegen Panzerung

```
benötigt  = Rüstungsklasse × 11
Chance    = clamp01(0,5 + (Durchschlag − benötigt) / 26)
```

Eine **Rampe statt einer Schwelle**: Am Gleichstand ist es ein Münzwurf.
Grenzwertige Munition bleibt dadurch spannend, statt zwischen „geht immer" und
„geht nie" umzuschalten.

- **Durchschlagen** → voller Zonenschaden, Rüstung nimmt 1,1 Haltbarkeit
- **Aufgehalten** → Schaden × (1 − Reduktion), Rüstung nimmt 3,2 Haltbarkeit
- Haltbarkeit senkt die **effektive** Klasse, aber nie unter 25 % — eine
  ruinierte Platte ist geschwächt, nicht wertlos

**Deckung nach Zone**: Die Faserweste deckt nur den Torso, der Schalenhelm nur
den Kopf. Ein Helm ist damit kein Luxus, sondern die Antwort auf genau die Zone,
die sonst jeden Raid beendet.

**Fragmentierung greift nur in Fleisch.** Genau das ist der Zielkonflikt:
Splitterkern gegen Ungepanzerte, Stahlkern gegen Platten. Man kann nicht beides
mitnehmen, ohne Gewicht zu zahlen.

---

## 5. Aufsätze

Vier Slots, kein einziger reiner Vorteil:

| Aufsatz | Gewinn | Preis |
|---------|--------|-------|
| Langlauf VK | −22 % Streuung, +6 m Reichweite, +18 % Geschossgeschwindigkeit | −12 Ergonomie, +0,9 kg |
| Reflexvisier | −15 % Streuung, +8 Ergonomie | +0,25 kg |
| Erweitertes Magazin | +12 Schuss | +25 % Nachladezeit, −6 Ergonomie |
| Schalldämpfer | **−55 % Lärmradius** | −6 % Schaden, −6 % Geschwindigkeit, −5 Ergonomie |
| Kompensator | −40 % Streuungsaufbau, +6 Ergonomie | +10 % Lärm |

Der Schalldämpfer ist der stärkste Gegenstand im Spiel: Halber Lärmradius
bedeutet etwa ein Viertel der Fläche, die einen hört. In einem Spiel, das aufs
Ausweichen setzt, schlägt das jeden Schadensbonus.

Die Werkstatt zeigt bei jedem Teil das **Delta** zur aktuellen Konfiguration —
Zielkonflikte müssen vor dem Einbau sichtbar sein, nicht im Raid.

---

## 6. Ergonomie, Verschleiß und Ladehemmung

- **Ergonomie** steuert den Streuungsabbau (4 bis 13 °/s). Deshalb fühlt sich
  eine handliche Waffe besser an als eine starke.
- **Verschleiß** pro Schuss; bei 0 % Haltbarkeit steigt die Streuung um 85 %.
- **Ladehemmung** erst ab 45 % Verschleiß, dann quadratisch ansteigend, gedämpft
  durch Ergonomie.

Die Schwelle ist der entscheidende Designpunkt: Eine Waffe, die jederzeit
klemmen kann, ist nur Rauschen. Eine, die klemmt, wenn man sie vernachlässigt,
lehrt Instandhaltung.

Ladehemmung und Nachladen teilen sich **denselben Knopf**. Beide beantworten
dieselbe Spielerfrage — „meine Waffe schießt nicht, reparier das" — und ein
zweiter Knopf wäre unter Druck eine Sache zu viel.

Der Zustand wird über den Raid hinweg mitgeführt: Wer extrahiert, bringt eine
abgenutzte Waffe zurück. Die Werkstatt setzt instand, aber jede Instandsetzung
senkt den erreichbaren Höchstzustand um 6 % — eine Waffe ist ein Verbrauchsgut
auf langer Zeitskala.

---

## 7. Wurfgeschosse (`throwables.ts`)

Drei Antworten auf drei verschiedene Probleme, keine davon „mehr Schaden":

| Gegenstand | Wirkung | Löst |
|------------|---------|------|
| **Splitterladung** | 95 Schaden, Radius 4,2 m, quadratischer Abfall | einen Raum, den man nicht betreten kann |
| **Blender** | 4,5 s Desorientierung, Radius 6,5 m | ein Gefecht, das man nicht führen will |
| **Echo-Köder** | kein Schaden, Lärmradius 34 m | eine Patrouille, an der man vorbei will |

- Flug und Zünder laufen **unabhängig**: Ein früh gelandetes Geschoss zündet
  trotzdem planmäßig. Damit ist „Kochen lassen" später eine echte Option.
- Sichtlinie begrenzt die Explosion — eine Wand dazwischen rettet, genau wie
  erwartet.
- Ein desorientierter Gegner **verliert sein Ziel vollständig**. Das macht den
  Blender zum Fluchtwerkzeug statt zur schwächeren Granate.
- Der Köder ist der Gegenstand mit der stärksten Identität: null Schaden, aber
  in einem Spiel über Vermeidung der wirksamste Eingriff, den es gibt.

Eigene Granaten treffen auch den Werfer. Das ist Absicht.

---

## 8. Nahkampf (`melee.ts`)

Ausdrücklich **keine** Kampfoption, sondern die **Schleichoption**:

- gegen einen alarmierten Gegner: 34 Schaden — eine schlechte Idee
- gegen einen ahnungslosen: ×3,2 und beinahe lautlos (3 m Lärmradius)

Diese Asymmetrie gibt dem Spieler einen Grund, sich vorsichtig zu bewegen,
statt alles zu erschießen (Pillar P3). Nahkampf umgeht Zonen und Rüstungsklasse:
das ist eine Klinge an der Naht, kein Projektil gegen eine Platte.

---

## Tests

`weaponStats.test.ts` (19): Munitionsmultiplikatoren, Slug-Umbau der Schrotwaffe,
Aufsatz-Deltas samt Kosten, Ablehnung falscher Slots und unbekannter IDs,
Verschleißkurve, Ladehemmungs-Schwelle und -Grenzen, Invarianten über alle
Kombinationen.

`ballistics.test.ts` (11): Zonenverteilung folgt der Waffengewichtung,
Präzisionsgewehr trifft öfter den Kopf als die Schrotwaffe, unaufmerksame Ziele
werden besser getroffen, Determinismus, Rüstungsklasse sinkt monoton mit
Haltbarkeit, Durchschlagskurve ist monoton und am Gleichstand exakt 50 %,
Munitionswahl macht gegen Plattenträger einen messbaren Unterschied.

`combatSystems.test.ts` (14): Wurfgeschoss verbraucht Gegenstände, zündet,
Schaden fällt mit Entfernung, Blender desorientiert ohne Schaden und läuft
wieder ab, Nahkampf trifft nur im Bogen, Hinterhaltsbonus wird genau einmal
angewendet, Abklingzeit greift, Munitionswechsel beim Nachladen, Verschleiß im
Raid, Waffenzustand im Ergebnis.

---

## Offen / nächster Schritt

- **M3**: Fraktions-Feindschaft (aktuell kein Beschuss zwischen KI-Fraktionen),
  Schalldämpfer-Interaktion mit dem Hörsystem, Boss mit Phasen
- **M4**: Munition, die mit Anomalien interagiert
- **M6**: Rückstoß als Kamera-/Zielimpuls, sobald auf echter Hardware getestet
  werden kann — auf Twin-Stick würde ein Zielversatz gegen den Daumen des
  Spielers arbeiten, das ist ohne Gerätetest nicht seriös zu tunen
