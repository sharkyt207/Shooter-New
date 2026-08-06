# Modul: platform (mobile)

> Schicht 3 · Status 🟡 M6 — Web-Seite fertig, native Builds warten auf einen Mac

## Zweck

Die Nahtstelle zwischen dem Spiel und einem Telefon: nativer Speicher, Haptik,
App-Lebenszyklus, Ausrichtung, Statusleiste. Alles hinter Adaptern, damit
`game/**` und `ui/**` nie erfahren, worauf sie gerade laufen.

## Was hier ehrlich möglich war

Diese Umgebung ist Linux. Es gibt **kein macOS, kein Xcode, kein CocoaPods und
kein Signierzertifikat**, also ist Folgendes hier nicht entstanden und steht
weiterhin aus:

- `npx cap add ios` und der erste Xcode-Build
- App-Signierung, Provisioning-Profile, TestFlight-Upload
- Jede Zahl, die von echter Hardware kommt

Was **ist** entstanden: die vollständige Web- und Adapterseite, die auf einem
Mac nur noch `npx cap add ios && npx cap sync ios` braucht. Alles darunter ist
konfiguriert, getestet und dokumentiert.

Das ist keine Ausrede, sondern die Aufteilung: Der Anteil, der auf jeder
Plattform gleich ist, ist fertig; der Anteil, der eine Apple-Toolchain braucht,
ist es nicht und kann es hier nicht sein.

## Der native Weg (auf einem Mac)

```bash
npm install
npm run build
npx cap add ios          # einmalig, erzeugt ios/
npx cap sync ios         # nach jedem Build
npx cap open ios         # Xcode: Team wählen, signieren, laufen lassen
```

`npm run cap:ios` fasst Build, Sync und Öffnen zusammen. `capacitor.config.ts`
enthält App-ID, Name, `webDir` und die iOS-Einstellungen, die von Anfang an
stimmen müssen (dunkler Hintergrund gegen den weißen Blitz beim Start,
`scrollEnabled: false` gegen Rubber-Banding während eines Raids).

## Adapter

Jeder folgt demselben Muster: eine Schnittstelle, eine Web-Implementierung, eine
native Implementierung, und eine `create…()`-Funktion, die die richtige wählt.
Die nativen Plugins werden **lazy** importiert.

| Adapter | Web | Nativ | Warum es zählt |
|---------|-----|-------|----------------|
| `storage` | localStorage | Capacitor Preferences | localStorage einer Web-View ist **löschbar**: iOS räumt sie bei Speichermangel ab. Wer sein Lager an einen Aufräumlauf verliert, kommt nicht wieder. |
| `haptics` | Vibration API | Capacitor Haptics | Auf einem Touchscreen gibt es keinen Abzug zu spüren — ein kurzer Impuls ist die einzige körperliche Rückmeldung |
| `appLifecycle` | `visibilitychange`, `pagehide`, `blur` | `appStateChange`, `pause`, `resume` | Ein Telefon unterbricht ohne zu fragen |
| `nativeBridge` | — | injiziertes `window.Capacitor` | Eine Zeile, die entscheidet, welcher Zweig gilt |

### Warum `window.Capacitor` statt `import { Capacitor }`

`@capacitor/core` zu importieren, nur um eine Plattform zu benennen, hat **43 kB**
in das Web-Bundle gelegt — für einen String-Vergleich. Nativ injiziert Capacitor
`window.Capacitor`, bevor Anwendungscode läuft, und `getPlatform()` liest genau
diesen Wert. Alles Schwerere wird lazy geladen und landet in eigenen
Chunks (je 0,3–1,2 kB), die ein Browser nie anfordert.

## Unterbrechungen

> **Regel: Eine Unterbrechung darf niemals etwas kosten.**

Web- und native Ereignisse hängen an denselben zwei Callbacks:

```
onSuspend →  Profil speichern · Audio anhalten · laufenden Raid pausieren
onResume  →  Audio fortsetzen
```

`onSuspend` wird für **eine** Unterbrechung mehrfach aufgerufen — die Quellen
überlappen absichtlich. Alles darin ist idempotent, denn den Speichervorgang zu
verpassen ist ungleich schlimmer, als ihn zweimal zu machen. `pagehide` ist auf
iOS das letzte Ereignis, das eine Web-View garantiert liefert, bevor sie
eingefroren oder beendet wird.

Ein laufender Raid wird pausiert und nicht weitergerechnet: Wer einen Anruf
annimmt, soll nicht tot zurückkommen.

## Touch

**Stick-Radius skaliert mit dem Bildschirm.** Ein Daumenzug ist eine körperliche
Strecke, keine Pixelzahl: 90 px sind auf einem 6-Zoll-Telefon bequem und auf
einem Tablet ein Zucken. Der Radius ist jetzt ein Anteil der **kurzen**
Bildschirmkante (19 %), begrenzt auf 62–130 px. Der gezeichnete Ring folgt über
eine CSS-Variable — ein Stick, der größer aussieht als er liest, ist schlimmer
als keiner.

**Haptik nur für das, was dem Spieler passiert**, nie für das, was er selbst
tut. Ein Brummen bei jedem Schuss ist Lärm; eines beim Treffer ist Information.
Verdrahtet sind: Treffer (Stärke nach Schaden), Ladehemmung (Warnung),
Rückstoß-Puls, geöffnetes Schloss, geöffneter Ausgang.

## Ausrichtung, Notch, Seitenverhältnisse

- Nativ wird auf Querformat gesperrt (`ScreenOrientation.lock`), Statusleiste
  ausgeblendet.
- Im Browser gibt es keine verlässliche Sperre. Statt sich zu weigern, **bittet**
  das Spiel: eine Hinweisebene im Hochformat, die verschwindet, sobald gedreht
  wird. Geprüft auf 390×844 und 844×390.
- Safe-Area-Insets liegen seit M1 als CSS-Variablen vor (`--safe-top` usw.) und
  werden von jedem HUD-Element benutzt. Ein Headless-Browser meldet keine
  Insets, also ist das der eine Punkt, der ein echtes Gerät mit Notch braucht.
- `orientationchange` wird auf iOS gefeuert, **bevor** die Viewport-Maße stehen,
  deshalb wird das Layout im nächsten Frame noch einmal gerechnet.

## Performance

Gemessen statt geschätzt (docs/01-ARCHITECTURE.md §8):

| Posten | Budget | Gemessen | Wo |
|--------|--------|----------|-----|
| Simulation | ≤ 3,0 ms | **0,13 ms** | `src/app/performance.test.ts` |
| View-Model | Teil von 1,5 ms | **0,007 ms** | dieselbe Datei |
| Draw Calls | ≤ 60 | **5–7** | `npm run measure` |
| Entities | ≤ 300 | ~180 | `performance.test.ts` |

**Der Befund ist, dass es nichts zu optimieren gab.** Die Vermutung vor der
Messung war, dass die einzeln erzeugten Platzhaltertexturen das Sprite-Batching
zerreißen und ein Texture-Atlas nötig wird. Die Messung sagt 5–7 Draw Calls bei
einem Budget von 60: Pixi bindet mehrere Texturen pro Batch, und bei dieser
Anzahl sichtbarer Texturen bringt ein Atlas nichts. Ein Atlas wäre Arbeit
gewesen, die eine Zahl verbessert, die niemanden stört.

Deshalb ist aus dem Performance-Pass ein **Werkzeug** geworden statt einer
Optimierung: `npm run measure` zählt echte WebGL-Draw-Calls im Browser, und
`performance.test.ts` prüft die veröffentlichten Budgets bei jedem Testlauf. Sie
sind großzügig gegen die Messung gesetzt, damit ein langsamer Build-Agent nicht
fehlschlägt — was sie abfangen sollen, ist eine versehentliche O(n²)-Schleife,
nicht ein paar Prozent Drift.

Alle Zahlen stammen von Desktop und Software-Rendering. **Die einzigen Zahlen,
die zählen, kommen von einem Gerät**, und die stehen noch aus.

## Tests

- `src/platform/native/nativeBridge.test.ts` — Plattformerkennung ohne Runtime,
  mit injiziertem Runtime, bei unbekannter Plattform und bei einem Runtime, der
  wirft; Speicherwahl; Web-Haptik inklusive Aus-Schalter und fehlender
  Vibration-API; Stick-Radius mit Skalierung und beiden Grenzen.
- `src/app/performance.test.ts` — die Budgets aus §8, plus ein Leck-Test über
  1800 Ticks.
- `scripts/smoke-browser.mjs` — läuft den kompletten Loop zusätzlich im
  **Telefonformat 844×390** durch und fotografiert das HUD dort.

## Offen / nächster Schritt

- Alles, was einen Mac braucht (siehe oben)
- Gerätemessung: Draw Calls, Frame-Zeit und Peak-RAM auf einem iPhone 11
- Safe-Area auf einem Gerät mit Notch verifizieren
- Android-Projekt (`npx cap add android`) — die Konfiguration steht bereits
